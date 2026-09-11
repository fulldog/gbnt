<script setup lang="ts">
import type { SysApi, SysRole } from "@gbnt/api-client";
import { ElMessage, vLoading } from "element-plus";
import { computed, onScopeDispose, shallowRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import PermissionMatrix from "@/components/PermissionMatrix.vue";
import { errorMessage } from "@/utils/error";
import { defaultRolePermissions, grantableRoleApis, previewRoleName } from "@/utils/role-permissions";
import "@/styles/role-form-dialog.css";

const visible = defineModel<boolean>({ required: true });
const { role = null } = defineProps<{ role?: SysRole | null }>();
const emit = defineEmits<{ saved: [role: SysRole, created: boolean] }>();
const api = useAdminApi();
const code = shallowRef("");
const codeTouched = shallowRef(false);
const desc = shallowRef("");
const catalog = shallowRef<SysApi[]>([]);
const selected = shallowRef<number[]>([]);
const loading = shallowRef(false);
const ready = shallowRef(false);
const submitting = shallowRef(false);
const loadError = shallowRef("");
const saveError = shallowRef("");
let sequence = 0;
let disposed = false;
const preview = computed(() => previewRoleName(catalog.value, selected.value));
const name = computed(() => role?.name ?? (ready.value ? preview.value.name : ""));
const codeError = computed(() => !code.value.trim() ? "请输入角色ID" : /^[a-z][a-z0-9_-]{0,63}$/i.test(code.value.trim()) ? "" : "以英文字母开头，支持英文、数字、下划线和短横线，最多64位");
const hasAdminLogin = computed(() => catalog.value.some((item) => item.module === "web.auth" && item.action === "login" && selected.value.includes(item.id)));
const validationError = computed(() => [...desc.value.trim()].length > 255 ? "角色备注不能超过255字" : !role ? preview.value.error : "");
const canSave = computed(() => ready.value && !loading.value && !submitting.value && !codeError.value && !validationError.value && role?.id !== 1);

async function load(): Promise<void> {
  const request = ++sequence;
  const editing = role;
  loading.value = true;
  ready.value = false;
  loadError.value = "";
  catalog.value = [];
  selected.value = [];
  try {
    const [apis, permissions] = await Promise.all([
      api.roles.listApis(),
      editing ? api.roles.getPermissions(editing.id) : Promise.resolve(null),
    ]);
    if (disposed || request !== sequence || !visible.value) return;
    catalog.value = grantableRoleApis(apis);
    // 旧后端会忽略组合保存的权限，必须阻止把半成品角色当作成功。
    if (!catalog.value.some((item) => item.duty && item.role_code_supported)) throw new Error("角色配置服务尚未更新，请联系管理员后重试");
    if (editing) {
      const ids = permissions?.api_ids;
      if (ids === "*" && editing.id === 1) selected.value = catalog.value.map((item) => item.id);
      else if (Array.isArray(ids) && ids.every((id) => Number.isSafeInteger(id) && id > 0)) selected.value = [...ids];
      else throw new Error("角色权限数据异常，请重试");
    } else {
      selected.value = defaultRolePermissions(catalog.value);
    }
    ready.value = true;
  } catch (error) {
    if (!disposed && request === sequence) loadError.value = errorMessage(error, "角色权限加载失败，请重试");
  } finally {
    if (!disposed && request === sequence) loading.value = false;
  }
}

async function save(): Promise<void> {
  if (!canSave.value) return;
  const request = sequence;
  const editing = role;
  const input = { code: code.value.trim().toLowerCase(), desc: desc.value.trim(), api_ids: [...selected.value] };
  submitting.value = true;
  saveError.value = "";
  try {
    const saved = editing ? await api.roles.update(editing.id, input) : await api.roles.create(input);
    if (disposed || request !== sequence) return;
    ElMessage.success(editing ? "角色已修改" : "角色已新增");
    emit("saved", saved, !editing);
    visible.value = false;
  } catch (error) {
    if (!disposed && request === sequence) saveError.value = errorMessage(error, "角色保存失败，请重试");
  } finally {
    if (!disposed && request === sequence) submitting.value = false;
  }
}

watch([visible, () => role?.id], ([open]) => {
  sequence += 1;
  if (!open) return;
  code.value = role?.code ?? "";
  codeTouched.value = false;
  desc.value = role?.desc ?? "";
  saveError.value = "";
  submitting.value = false;
  void load();
}, { immediate: true });
onScopeDispose(() => { disposed = true; sequence += 1; });
</script>

<template>
  <ElDialog v-model="visible" class="role-form-dialog" :title="role ? '修改角色' : '新增角色'" width="min(640px, 94vw)" top="10vh" destroy-on-close :close-on-click-modal="!submitting" :close-on-press-escape="!submitting" :show-close="!submitting">
    <div @submit.prevent="save">
    <ElForm class="role-form" label-position="right" label-width="98px">
      <ElFormItem label="角色ID" required :error="codeTouched ? codeError : ''">
        <ElInput v-model="code" maxlength="64" placeholder="例如 admin、test" autocomplete="off" :disabled="submitting || role?.id === 1" @blur="codeTouched = true; code = code.trim().toLowerCase()" />
        <p class="role-form-hint">英文开头，可含数字、下划线和短横线，保存时统一小写。</p>
        <p class="role-form-hint">角色名称：<span class="role-name-preview">{{ name || (loading ? '正在加载职责…' : '根据授权职责自动生成') }}</span>（{{ role ? '创建时生成，修改权限后保持不变' : '根据授权职责自动生成' }}）</p>
      </ElFormItem>
      <ElFormItem label="角色备注">
        <ElInput v-model="desc" type="textarea" :rows="1" :autosize="{ minRows: 1, maxRows: 3 }" maxlength="255" show-word-limit placeholder="填写角色职责或权限备注" :disabled="submitting" />
      </ElFormItem>
      <ElFormItem label="授权" class="role-auth-item">
        <div class="role-auth" v-loading="loading" :aria-busy="loading">
          <AsyncError v-if="loadError" :message="loadError" @retry="load" />
          <PermissionMatrix v-else-if="ready" v-model="selected" :apis="catalog" :disabled="loading || submitting || role?.id === 1" />
          <p v-if="ready && !hasAdminLogin" class="role-form-hint">未授予管理后台登录权限，此角色不能登录管理后台。</p>
          <p v-if="ready && !selected.length" class="role-form-hint">未分配职责：当前未授予任何管理后台操作权限。</p>
        </div>
      </ElFormItem>
      <ElAlert v-if="validationError && ready" :title="validationError" type="warning" :closable="false" show-icon />
      <ElAlert v-if="saveError" class="role-save-error" :title="saveError" type="error" :closable="false" show-icon />
    </ElForm>
    </div>
    <template #footer>
      <ElButton :disabled="submitting" @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitting" :disabled="!canSave" @click="save">保存</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.role-form :deep(.el-form-item) { margin-bottom: 14px; }
.role-form :deep(.el-form-item__label) { padding-right: 8px; }
.role-form :deep(.el-form-item__content) { min-width: 0; }
.role-form .role-auth-item { margin-bottom: 0; }
.role-form-hint { width: 100%; margin: 6px 0 0; font-size: 12px; color: var(--gbnt-text-secondary); line-height: 1.6; }
.role-auth { width: 100%; min-height: 100px; }
.role-auth :deep(.permission-matrix) { max-height: 420px; overflow-y: auto; }
.role-save-error { margin-top: 12px; }
@media (max-width: 540px) {
  .role-form :deep(.el-form-item) { display: block; }
  .role-form :deep(.el-form-item__label) { justify-content: flex-start; width: auto !important; height: auto; padding: 0; margin-bottom: 6px; }
  .role-auth :deep(.permission-matrix) { max-height: none; overflow: visible; }
}
</style>

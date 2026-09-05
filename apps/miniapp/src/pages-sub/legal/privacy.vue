<script setup lang="ts">
import LegalPlaceholder from "@/components/legal/LegalPlaceholder.vue";
import type { LegalPlaceholderSection } from "@/components/legal/types";

const sections: LegalPlaceholderSection[] = [
  {
    title: "个人信息处理清单",
    description: "需逐项列明账号身份、手机号、组织信息、现场位置、照片、签名及运行日志等信息是否收集和对应目的。",
  },
  {
    title: "设备权限使用",
    description: "需说明相机、相册和定位权限的触发场景、拒绝后的影响及用户重新授权方式。",
  },
  {
    title: "存储、期限与安全",
    description: "需明确数据存储地点、保存期限、访问控制、安全措施，以及巡查照片和签名的访问范围。",
  },
  {
    title: "共享、委托与第三方服务",
    description: "需列出地图、逆地址解析、消息通知等第三方服务及其处理的信息，不得使用未经确认的第三方 SDK。",
  },
  {
    title: "用户权利与联系方式",
    description: "需提供查询、更正、删除、撤回授权、注销及投诉渠道，并说明未成年人信息处理规则。",
  },
];
</script>

<template>
  <LegalPlaceholder
    title="隐私政策"
    summary="正式政策应与微信小程序后台填写的隐私保护指引、实际使用的接口权限和服务端数据处理行为保持一致。"
    :sections="sections"
  />
</template>

<script setup lang="ts">
import LegalPlaceholder from "@/components/legal/LegalPlaceholder.vue";
import type { LegalPlaceholderSection } from "@/components/legal/types";

const sections: LegalPlaceholderSection[] = [
  {
    title: "服务主体与适用范围",
    description: "需明确平台运营主体、服务对象、适用地域、联系方式以及协议生效范围。",
  },
  {
    title: "账号使用规则",
    description: "需明确账号取得方式、实名或组织绑定规则、凭证保管责任、账号停用与注销机制。",
  },
  {
    title: "巡查与整改责任",
    description: "需明确上报资料真实性、现场拍摄要求、整改提交规则以及禁止上传的内容。",
  },
  {
    title: "平台责任边界",
    description: "需由法务确认系统中断、定位偏差、第三方服务异常及不可抗力等责任边界。",
  },
  {
    title: "知识产权与争议解决",
    description: "需补充软件和资料权属、适用法律、争议处理方式、协议变更与通知机制。",
  },
];
</script>

<template>
  <LegalPlaceholder
    title="用户协议"
    summary="正式协议应说明用户使用农田专项整治小程序及相关巡查、整改服务时，平台与用户各自享有的权利并承担的义务。"
    :sections="sections"
  />
</template>

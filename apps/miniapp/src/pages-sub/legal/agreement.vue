<script setup lang="ts">
import LegalDocument from "@/components/legal/LegalDocument.vue";
import { userAgreement } from "@/content/legal";
</script>

<template>
  <LegalDocument :document="userAgreement" />
</template>

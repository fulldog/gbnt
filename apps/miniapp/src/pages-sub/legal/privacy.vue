<script setup lang="ts">
import LegalDocument from "@/components/legal/LegalDocument.vue";
import { privacyPolicy } from "@/content/legal";
</script>

<template>
  <LegalDocument :document="privacyPolicy" />
</template>

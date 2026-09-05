<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { useAuthStore } from "@/stores/auth";

onLaunch(() => {
  void useAuthStore().restore();
});
</script>

<style lang="scss">
@use "./styles/tokens.scss";
@use "./styles/global.scss";
</style>

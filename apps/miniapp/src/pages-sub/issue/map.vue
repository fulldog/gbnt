<script setup lang="ts">
import { onLoad, onUnload } from "@dcloudio/uni-app";
import { computed, shallowRef } from "vue";
import { miniappApi } from "@/api/runtime";
import { errorMessage, hasValidCoordinates } from "@/utils/issue-display";
import { deviceFailureMessage, showDeviceFailure } from "@/utils/device-permissions";

interface PageQuery {
  id?: string;
  lat?: string;
  lng?: string;
  address?: string;
}

const issueId = shallowRef(0);
const targetLat = shallowRef(0);
const targetLng = shallowRef(0);
const address = shallowRef("问题位置");
const currentLat = shallowRef<number>();
const currentLng = shallowRef<number>();
const loading = shallowRef(false);
const error = shallowRef("");
const locationError = shallowRef("");
const locating = shallowRef(false);
let active = true;
let requestSequence = 0;

const hasTarget = computed(() => hasValidCoordinates(targetLat.value, targetLng.value));
const hasCurrent = computed(
  () =>
    currentLat.value !== undefined &&
    currentLng.value !== undefined &&
    hasValidCoordinates(currentLat.value, currentLng.value),
);
const markers = computed(() =>
  hasTarget.value
    ? [
        {
          id: 1,
          latitude: targetLat.value,
          longitude: targetLng.value,
          title: "问题位置",
          width: 30,
          height: 40,
          callout: {
            content: "问题位置",
            color: "#172033",
            fontSize: 13,
            borderRadius: 6,
            bgColor: "#ffffff",
            padding: 8,
            display: "ALWAYS",
          },
        },
      ]
    : [],
);
const includePoints = computed(() => {
  const points = hasTarget.value
    ? [{ latitude: targetLat.value, longitude: targetLng.value }]
    : [];
  if (hasCurrent.value) {
    points.push({ latitude: currentLat.value!, longitude: currentLng.value! });
  }
  return points;
});
const distance = computed(() => {
  if (!hasTarget.value || !hasCurrent.value) return "—";
  return formatDistance(
    haversineMeters(currentLng.value!, currentLat.value!, targetLng.value, targetLat.value),
  );
});

function haversineMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const radius = 6_371_000;
  const toRadians = Math.PI / 180;
  const deltaLat = (lat2 - lat1) * toRadians;
  const deltaLng = (lng2 - lng1) * toRadians;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1 * toRadians) *
      Math.cos(lat2 * toRadians) *
      Math.sin(deltaLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} 米`;
  return `${(meters / 1000).toFixed(2)} 千米`;
}

function locateCurrent(): void {
  if (!active || locating.value) return;
  locating.value = true;
  locationError.value = "";
  uni.getLocation({
    type: "gcj02",
    isHighAccuracy: true,
    highAccuracyExpireTime: 5000,
    success: (result) => {
      if (!active) return;
      currentLat.value = Number(result.latitude);
      currentLng.value = Number(result.longitude);
      if (!hasCurrent.value) locationError.value = "当前位置坐标无效";
    },
    fail: (cause) => {
      if (!active) return;
      currentLat.value = undefined;
      currentLng.value = undefined;
      locationError.value = deviceFailureMessage(cause, "获取当前位置");
      showDeviceFailure(cause, "获取当前位置");
    },
    complete: () => { locating.value = false; },
  });
}

async function loadIssueLocation(): Promise<void> {
  if (!issueId.value) {
    error.value = "缺少有效的问题编号或位置坐标";
    return;
  }

  const requestId = ++requestSequence;
  loading.value = true;
  error.value = "";
  try {
    const issue = await miniappApi.issues.get(issueId.value);
    if (requestId !== requestSequence) return;
    if (!hasValidCoordinates(issue.lat, issue.lng)) {
      error.value = "该问题尚未保存有效坐标";
      return;
    }
    targetLat.value = issue.lat;
    targetLng.value = issue.lng;
    address.value = issue.address || "问题位置";
    locateCurrent();
  } catch (cause) {
    if (requestId !== requestSequence) return;
    error.value = errorMessage(cause, "问题位置加载失败");
  } finally {
    if (requestId === requestSequence) loading.value = false;
  }
}

function openInMap(): void {
  if (!hasTarget.value) return;
  uni.openLocation({
    latitude: targetLat.value,
    longitude: targetLng.value,
    name: "问题位置",
    address: address.value,
    scale: 16,
    fail: (cause) => {
      if (active) showDeviceFailure(cause, "打开地图导航");
    },
  });
}

onLoad((rawQuery) => {
  const query = (rawQuery ?? {}) as PageQuery;
  issueId.value = Number(query.id) || 0;
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  if (query.address) {
    try { address.value = decodeURIComponent(query.address); }
    catch { address.value = query.address; }
  }

  if (hasValidCoordinates(lat, lng)) {
    targetLat.value = lat;
    targetLng.value = lng;
    locateCurrent();
  } else {
    void loadIssueLocation();
  }
});

onUnload(() => {
  active = false;
  requestSequence += 1;
});
</script>

<template>
  <view class="map-page">
    <view v-if="loading" class="map-page__state">
      <view class="map-page__spinner" />
      <text>正在加载位置…</text>
    </view>

    <view v-else-if="error || !hasTarget" class="map-page__state">
      <text class="map-page__state-title">暂无可用位置</text>
      <text class="map-page__state-text">{{ error || "该记录未保存坐标" }}</text>
      <button v-if="issueId" class="map-page__retry" @tap="loadIssueLocation">
        重新加载
      </button>
    </view>

    <template v-else>
      <map
        class="map-page__map"
        :latitude="targetLat"
        :longitude="targetLng"
        :markers="markers"
        :include-points="includePoints"
        :scale="15"
        show-location
        enable-traffic
      />

      <view class="map-page__actions">
        <button class="map-page__secondary" :disabled="locating" :aria-label="locating ? '正在定位' : '重新定位'" @tap="locateCurrent">
          <view v-if="locating" class="map-page__locating" aria-hidden="true" />
          <image v-else class="map-page__locate-icon" src="/static/icons/locate-primary.svg" mode="aspectFit" aria-hidden="true" />
        </button>
        <button class="map-page__primary" aria-label="打开地图导航" @tap="openInMap">导航</button>
      </view>
      <view class="map-page__panel">
        <view class="map-page__address-row">
          <view class="map-page__address-wrap">
            <text class="map-page__address">{{ address }}</text>
          </view>
          <text class="map-page__distance">{{ distance }}</text>
        </view>

        <text v-if="locationError" class="map-page__location-error" @tap="locateCurrent">
          {{ locationError }}，点击重试
        </text>


      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.map-page {
  position: relative;
  min-height: 100vh;
  background: var(--gb-color-background, #f4f7fa);
}

.map-page__map {
  width: 100%;
  height: 100vh;
}

.map-page__panel {
  position: fixed;
  right: 10px;
  bottom: calc(30px + env(safe-area-inset-bottom));
  left: 10px;
  z-index: 5;
  padding: 12px 18px;
  border: 0;
  border-radius: 999px;
  background: #fff;
}

.map-page__address-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.map-page__pin {
  margin-top: 10rpx;
  color: var(--gb-color-primary, #015cbb);
  font-size: 20rpx;
}

.map-page__address-wrap {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 6rpx;
}

.map-page__label {
  color: var(--gb-color-text-muted, #8490a3);
  font-size: 23rpx;
}

.map-page__address {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--gb-color-text-primary);
  font-size: 14px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-page__distance {
  flex: none;
  color: var(--gb-color-primary);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}

.map-page__location-error {
  display: block;
  margin-top: 8px;
  color: var(--gb-color-warning, #d48806);
  font-size: 12px;
  line-height: 1.5;
}

.map-page__actions {
  position: fixed;
  right: 16px;
  bottom: calc(100px + env(safe-area-inset-bottom));
  z-index: 5;
  display: flex;
  gap: 8px;
}

.map-page__secondary,
.map-page__primary,
.map-page__retry {
  min-width: 44px;
  height: 44px;
  margin: 0;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  line-height: 42px;
}

.map-page__secondary {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid var(--gb-color-primary, #015cbb);
  background: #fff;
  color: var(--gb-color-primary, #015cbb);
}

.map-page__locate-icon {
  flex: none;
  width: 20px;
  height: 20px;
}

.map-page__locating {
  flex: none;
  width: 20px;
  height: 20px;
  border: 2px solid rgba(1, 92, 187, 0.16);
  border-top-color: var(--gb-color-primary, #015cbb);
  border-radius: 50%;
  animation: map-spin 800ms linear infinite;
}

.map-page__primary {
  border: 1rpx solid var(--gb-color-primary, #015cbb);
  background: var(--gb-color-primary, #015cbb);
  color: #fff;
}

.map-page__secondary::after,
.map-page__primary::after,
.map-page__retry::after {
  border: 0;
}

.map-page__state {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
  color: var(--gb-color-text-muted, #8490a3);
  text-align: center;
}

.map-page__spinner {
  width: 48rpx;
  height: 48rpx;
  margin-bottom: 24rpx;
  border: 5rpx solid rgba(1, 92, 187, 0.16);
  border-top-color: var(--gb-color-primary, #015cbb);
  border-radius: 50%;
  animation: map-spin 800ms linear infinite;
}

.map-page__state-title {
  color: var(--gb-color-text-primary, #172033);
  font-size: 30rpx;
  font-weight: 600;
}

.map-page__state-text {
  margin-top: 14rpx;
  font-size: 25rpx;
  line-height: 1.6;
}

.map-page__retry {
  min-width: 180rpx;
  margin-top: 28rpx;
  border: 1rpx solid var(--gb-color-primary, #015cbb);
  background: #fff;
  color: var(--gb-color-primary, #015cbb);
}

@keyframes map-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

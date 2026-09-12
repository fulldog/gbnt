import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, type Ref } from "vue";
import { setupSfc } from "./helpers/setup-sfc";
import * as photoUploads from "@/composables/report/usePhotoUploads";
import * as issueDisplay from "@/utils/issue-display";
import * as devicePermissions from "@/utils/device-permissions";
import * as nativeOverlay from "@/utils/native-overlay";
import type { UploadedPhoto } from "@/domain/issues/form";

interface PhotoPickerState {
  selecting: Ref<boolean>;
  addPhoto(): void;
  preview(index: number, loadedUrl?: string): void;
}

const chooseMedia = vi.fn();
const previewImage = vi.fn();

function setup(modelValue: UploadedPhoto[] = []) {
  const emit = vi.fn();
  const props = reactive({
    modelValue,
    maximum: 6,
    cameraOnly: false,
    cooldownSeconds: 0,
    watermark: true,
    location: { lat: 36, lng: 116, address: "现场地址" },
  });
  const state = setupSfc("components/media/PhotoPicker.vue", props, {
    "@/api/runtime": {
      miniappApi: { attachments: { uploadImages: vi.fn() } },
      toAssetUrl: (url: string) => url,
    },
    "@/components/common/RecoverableImage.vue": {},
    "@/composables/report/usePhotoUploads": photoUploads,
    "@/utils/issue-display": issueDisplay,
    "@/utils/device-permissions": devicePermissions,
    "@/utils/native-overlay": nativeOverlay,
  }, emit) as unknown as PhotoPickerState;
  return { state, emit };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("uni", {
    chooseMedia,
    previewImage,
    showToast: vi.fn(),
    showModal: vi.fn(),
    openSetting: vi.fn(),
  });
});

describe("照片原生窗口会话保护", () => {
  it("选择相机或相册前开启保护，返回结果后解除", () => {
    let options!: { success(result: { tempFiles: [] }): void };
    chooseMedia.mockImplementation((input) => { options = input; });
    const { state, emit } = setup();

    state.addPhoto();
    expect(state.selecting.value).toBe(true);
    expect(emit.mock.calls.filter(([event]) => event === "nativeOverlay")).toEqual([
      ["nativeOverlay", true],
    ]);

    options.success({ tempFiles: [] });
    expect(state.selecting.value).toBe(false);
    expect(emit.mock.calls.filter(([event]) => event === "nativeOverlay")).toEqual([
      ["nativeOverlay", true],
      ["nativeOverlay", false],
    ]);
  });

  it("预览照片成功打开后等待页面 onShow 统一复位，打开失败则立即解除", () => {
    let options!: { fail(error: { errMsg?: string }): void };
    previewImage.mockImplementation((input) => { options = input; });
    const { state, emit } = setup([{ fileId: "photo", url: "/photo.jpg" }]);

    state.preview(0);
    expect(emit.mock.calls.filter(([event]) => event === "nativeOverlay")).toEqual([
      ["nativeOverlay", true],
    ]);

    options.fail({ errMsg: "previewImage:fail" });
    expect(emit.mock.calls.filter(([event]) => event === "nativeOverlay")).toEqual([
      ["nativeOverlay", true],
      ["nativeOverlay", false],
    ]);
  });
});

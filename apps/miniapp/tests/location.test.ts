import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocation } from "@/composables/report/useLocation";

const chooseLocation = vi.fn();
const getLocation = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("uni", {
    chooseLocation,
    getLocation,
    showToast: vi.fn(),
    showModal: vi.fn(),
    openSetting: vi.fn(),
  });
});

describe("巡查位置选择", () => {
  it("左侧地图入口以已有坐标为中心，并返回确认后的地址与坐标", async () => {
    chooseLocation.mockImplementation(({ success }: { success(result: object): void }) => success({
      address: "山东省聊城市开发区",
      name: "李官屯新村",
      latitude: 36.4567,
      longitude: 115.9876,
    }));
    const location = useLocation();

    await expect(location.choose({ latitude: 36, longitude: 116 })).resolves.toEqual({
      address: "山东省聊城市开发区 李官屯新村",
      latitude: 36.4567,
      longitude: 115.9876,
    });
    expect(chooseLocation).toHaveBeenCalledWith(expect.objectContaining({ latitude: 36, longitude: 116 }));
    expect(location.busy.value).toBe(false);
  });

  it("右侧刷新先获取最新 GPS，再把地图确认结果作为最终位置", async () => {
    getLocation.mockResolvedValue({ latitude: 36.7, longitude: 116.8 });
    chooseLocation.mockImplementation(({ success }: { success(result: object): void }) => success({
      address: "山东省聊城市",
      name: "当前巡查点",
      latitude: 36.7001,
      longitude: 116.8001,
    }));
    const location = useLocation();

    await expect(location.refresh()).resolves.toEqual({
      address: "山东省聊城市 当前巡查点",
      latitude: 36.7001,
      longitude: 116.8001,
    });
    expect(getLocation).toHaveBeenCalledWith({
      type: "gcj02",
      isHighAccuracy: true,
      highAccuracyExpireTime: 5000,
    });
    expect(chooseLocation).toHaveBeenCalledWith(expect.objectContaining({ latitude: 36.7, longitude: 116.8 }));
    expect(getLocation.mock.invocationCallOrder[0]).toBeLessThan(chooseLocation.mock.invocationCallOrder[0]!);
    expect(location.refreshing.value).toBe(false);
  });

  it("取消地图不会生成位置，也不会把取消当成错误", async () => {
    chooseLocation.mockImplementation(({ fail }: { fail(error: object): void }) => fail({ errMsg: "chooseLocation:fail cancel" }));
    const location = useLocation();

    await expect(location.choose()).resolves.toBeNull();
    expect(uni.showToast).not.toHaveBeenCalled();
    expect(uni.showModal).not.toHaveBeenCalled();
  });

  it("打开和关闭微信原生地图时同步通知页面保留当前表单会话", async () => {
    let succeed!: (result: object) => void;
    chooseLocation.mockImplementation(({ success }: { success(result: object): void }) => { succeed = success; });
    const visibility = vi.fn();
    const location = useLocation({ onPickerVisibilityChange: visibility });

    const pending = location.choose();
    expect(visibility).toHaveBeenCalledWith(true);

    succeed({ address: "山东省聊城市", name: "现场", latitude: 36.4, longitude: 116.1 });
    await expect(pending).resolves.toMatchObject({ address: "山东省聊城市 现场" });
    expect(visibility.mock.calls).toEqual([[true], [false]]);
  });
});

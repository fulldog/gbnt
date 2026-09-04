import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PageHeader from "@/components/PageHeader.vue";

describe("PageHeader", () => {
  it("渲染标题、说明和操作区", () => {
    const wrapper = mount(PageHeader, {
      props: { title: "专项整改", description: "真实后端数据" },
      slots: { actions: "新增排查" },
    });

    expect(wrapper.get("h1").text()).toBe("专项整改");
    expect(wrapper.text()).toContain("真实后端数据");
    expect(wrapper.text()).toContain("新增排查");
  });
});

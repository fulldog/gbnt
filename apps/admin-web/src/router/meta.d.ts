import "vue-router";

declare module "vue-router" {
  interface RouteMeta {
    title: string;
    public?: boolean;
    module?: string;
  }
}

export {};

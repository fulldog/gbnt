import "element-plus/dist/index.css";
import { createApp } from "vue";
import App from "./App.vue";
import { adminApi, adminApiKey } from "./api/runtime";
import { pinia } from "./stores";
import { router } from "./router";
import "./styles/index.css";

const app = createApp(App);

app.provide(adminApiKey, adminApi);
app.use(pinia);
app.use(router);
app.mount("#app");

import { createApp } from "vue";
import { createPinia } from "pinia";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "./style.css";
import App from "./App.vue";

createApp(App).use(createPinia()).mount("#app");

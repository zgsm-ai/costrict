import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { setupStore } from './stores';

import '@/styles/index.less';
import App from './App.vue';
import Idux from './idux';
import router from './router';

const app = createApp(App).use(Idux);
setupStore(app);
app.use(createPinia());
app.use(router);

app.mount('#app');

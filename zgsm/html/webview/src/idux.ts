// idux.ts
import type { App } from 'vue';

// If you need to load CSS on demand, remove the following 2 lines of code
import '@idux/components/default.full.css';
import '@idux/components/index.full.css';
import '@idux/pro/index.css';
// If you need to load CSS on demand, add the following code as needed
// import "@idux/cdk/index.css";
// import "@idux/components/style/core/reset.css";
// import "@idux/components/style/core/reset-scroll.css";

// If you need to load JS on demand, remove the following 3 lines of code
import IduxCdk from '@idux/cdk';
import IduxComponents from '@idux/components';
import IduxPro from '@idux/pro';

import { createGlobalConfig } from '@idux/components/config';
import {
  addIconDefinitions,
  ArrowRight,
  Calendar,
  Close,
  DislikeFilled,
  Down,
  IDUX_ICON_DEPENDENCIES,
  LikeFilled,
  More,
  Reload,
  Up
} from '@idux/components/icon';
// import { enUS } from "@idux/components/locales";

// Static loading: `IDUX_ICON_DEPENDENCIES` are the icons used by some components of `@idux` by default. It is recommended to import them statically at this time.
addIconDefinitions([...IDUX_ICON_DEPENDENCIES, Reload, More, Calendar, Up, Down, LikeFilled, DislikeFilled, Close, ArrowRight]);

// Dynamic loading: It will not be packaged, which can reduce the package size. It needs to be loaded via an HTTP request when needed.
// Note: Please make sure that the SVG resources of the icons are correctly placed in the `public/idux-icons` directory. You can refer to the following Vite configuration.
const loadIconDynamically = (iconName: string) => {
  return fetch(`/idux-icons/${iconName}.svg`).then((res) => res.text());
};

const customConfig = { icon: { loadIconDynamically } };
const globalConfig = createGlobalConfig(customConfig);

const install = (app: App): void => {
  app.use(IduxCdk).use(IduxComponents).use(IduxPro).use(globalConfig);
};

export default { install };

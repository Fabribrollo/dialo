import {createElement} from 'react';
import {beforeEach,expect} from 'vitest';
import {render} from '@testing-library/react';
import ToastHost from '../components/shell/ToastHost.jsx';
import {leerAvisos,cerrarAviso} from '../components/shell/systemToastsStore.js';
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(cleanup);
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};

beforeEach(()=>{for(const a of leerAvisos())cerrarAviso(a.key);const path=expect.getState().testPath??'';if(!['system-toasts.test.jsx','channels-page.test.jsx','community-memberships.test.jsx'].some(file=>path.endsWith(file)))render(createElement(ToastHost));});

import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { setLanguage } from "../i18n";

beforeEach(async () => {
  await setLanguage("en");
});

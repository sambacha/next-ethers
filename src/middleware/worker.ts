
   
import { createEventHandler } from "@remix-run/cloudflare-workers";

import * as build from "../build";

addEventListener(
  "fetch",
  createEventHandler({
    build,
    getLoadContext(event) {
      return {
        waitUntil(promise) {
          return event.waitUntil(promise);
        },
      };
    },
  })
);
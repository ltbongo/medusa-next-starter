import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import PayfastProviderService from "./service";

export default ModuleProvider(Modules.PAYMENT, {
  services: [PayfastProviderService],
});

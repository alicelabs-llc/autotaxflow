// Backward-compat: import the real implementation from plugins/tenancy.ts.
// Old code that did `import { verifyOrganizationAccess, requireRole } from "../middlewares/tenancy"`
// keeps working; new code should import from "../plugins/tenancy".

export {
  default as tenancyPlugin,
  requireRole,
} from '../plugins/tenancy';

// Compatibility shim — the SAMA-only sub-category store has been generalised
// per round-3 §5 to a per-framework store at
// `@/stores/framework-sub-category-store`. New code should import from there
// and call `.list(frameworkId)`. This file re-exports the new surface plus a
// `useSAMASubCategoryStore` alias so existing imports keep compiling.
export {
  useFrameworkSubCategoryStore,
  useSAMASubCategoryStore,
} from '@/stores/framework-sub-category-store'
export type { SubCategory } from '@/stores/framework-sub-category-store'

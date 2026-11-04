/**
 * Swagger-ის ჯგუფები (tags). ყველა controller აქედან იღებს სახელს — ასე ახალი
 * endpoint შემთხვევით სხვა/ახალ ჯგუფში ვერ მოხვდება.
 *
 * რიგი ამ სიაში = რიგი Swagger-ში: ჯერ საჯარო (საიტი), მერე ადმინის, ბოლოს სისტემური.
 */
export const TAGS = {
  publicCatalog: 'public · catalog',
  publicCompatibility: 'public · compatibility',
  publicSearch: 'public · search',
  publicMedia: 'public · media',
  auth: 'auth',
  adminCatalog: 'admin · catalog',
  adminCompatibility: 'admin · compatibility',
  adminInventory: 'admin · inventory',
  adminUsers: 'admin · users',
  health: 'health',
} as const;

export const TAG_DESCRIPTIONS: Record<
  (typeof TAGS)[keyof typeof TAGS],
  string
> = {
  [TAGS.publicCatalog]:
    '🌐 **საჯარო, ლოგინის გარეშე** — საიტისთვის (storefront): მხოლოდ აქტიური კატეგორიები და პროდუქტები, ' +
    'მარაგი სტატუსით (ზუსტი რიცხვის გარეშე), ტექსტი ერთ ენაზე (`?locale=ka|en`).',
  [TAGS.publicCompatibility]:
    '🌐 საჯარო — „აირჩიე შენი დამტენი“: ბრენდები და მოდელები.',
  [TAGS.publicSearch]: '🌐 საჯარო — ძებნის ველის ავტოშევსება.',
  [TAGS.publicMedia]: '🌐 საჯარო — პროდუქტის სურათები (`images[].url`).',
  [TAGS.auth]: 'ადმინკის შესვლა / გასვლა, OAuth 2.0 ტოკენი, JWKS.',
  [TAGS.adminCatalog]:
    '🔒 ადმინი — კატეგორიები, პროდუქტები, სურათები (როლები: content_editor, manager, admin).',
  [TAGS.adminCompatibility]:
    '🔒 ადმინი — დამტენის ბრენდები, მოდელები, პროდუქტების თავსებადობა.',
  [TAGS.adminInventory]:
    '🔒 ადმინი — მარაგი და მისი ისტორია (როლები: warehouse, manager, admin).',
  [TAGS.adminUsers]: '🔒 ადმინი — ადმინკის მომხმარებლები (მხოლოდ superadmin).',
  [TAGS.health]: 'Kubernetes / usectl-ის შემოწმება.',
};

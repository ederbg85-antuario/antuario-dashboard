export const wosVariants=['peace','production','marketing','sales','finance','accounting','people','proposals','contacts','pipeline','agenda'] as const
export type WosVariant=typeof wosVariants[number]
export const wosAsset=(variant:WosVariant)=>variant==='peace'?'/wos/wos-peace.webp':`/wos/wos-${variant}-v1.webp`

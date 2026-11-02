import { SkeletonBlock } from '@/components/Skeleton'

export default function LigaLoading() {
  return (
    <div className="px-5 pt-5 pb-6 flex flex-col gap-4" role="status" aria-label="Cargando">
      <SkeletonBlock height={28} radius={8} />
      <SkeletonBlock height={44} radius={14} />
      <SkeletonBlock height={260} />
      <SkeletonBlock height={110} />
    </div>
  )
}

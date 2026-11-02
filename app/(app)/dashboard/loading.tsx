import { SkeletonBlock } from '@/components/Skeleton'

export default function DashboardLoading() {
  return (
    <div className="flex flex-col px-5 pt-4 pb-6 gap-4" role="status" aria-label="Cargando">
      <SkeletonBlock height={24} radius={8} />
      <SkeletonBlock height={250} radius={22} />
      <SkeletonBlock height={20} radius={8} />
      <SkeletonBlock height={220} />
    </div>
  )
}

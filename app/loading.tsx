// app/loading.tsx
export default function Loading() {
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      <div className="text-center">
        <div className="w-16 h-16 border-3 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-white/60">Loading AML Checker...</p>
      </div>
    </div>
  )
}
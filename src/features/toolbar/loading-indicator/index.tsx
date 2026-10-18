import { LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type LoadingIndicatorProps = {
  isLoading: boolean
  className?: string
}

export function LoadingIndicator({ isLoading, className }: LoadingIndicatorProps) {
  if (!isLoading) return null
  return (
    <span role="status" className={cn("flex text-muted-foreground", className)}>
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      <span className="sr-only">Loading</span>
    </span>
  )
}

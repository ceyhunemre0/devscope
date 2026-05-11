import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api/client'

function App() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-80">
        <CardHeader>
          <CardTitle>devscope</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="text-sm text-muted-foreground">loading…</p>
          )}
          {isError && (
            <Badge variant="destructive">error — backend unreachable</Badge>
          )}
          {data && (
            <div className="flex items-center gap-2">
              <Badge variant="default">Connected</Badge>
              <span className="text-sm text-muted-foreground">
                devscope v{data.version}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default App

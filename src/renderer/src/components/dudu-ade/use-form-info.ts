import { useEffect, useState } from 'react'
import type { FormAllow } from './asset-meta'

export type FormInfo = { hash: string; ports: number[]; allowed: boolean }

/** A page's content hash and the local ports its forms post to, and whether the saved allowance still holds. */
export function useFormInfo(path: string, allow: FormAllow | undefined): FormInfo | null {
  const [info, setInfo] = useState<FormInfo | null>(null)
  const key = allow ? `${allow.hash}:${allow.ports.join(',')}` : ''
  useEffect(() => {
    let cancelled = false
    void (window.api.shell.duduAdeArtifactFormInfo?.(path, allow) ?? Promise.resolve(null))
      .then((next) => !cancelled && setInfo(next))
      .catch(() => !cancelled && setInfo(null))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Why: key stands for allow.
  }, [path, key])
  return info
}

import { describe, expect, it } from 'vitest'
import { bashOutputPaths } from './dudu-ade-bash-targets'

const run = (command: string): string[] => bashOutputPaths(command, '/w/proj', '/h')

describe('files a shell command wrote', () => {
  it('takes redirect targets of shown kinds, in every spelling', () => {
    expect(run('echo hi > out/a.md')).toEqual(['/w/proj/out/a.md'])
    expect(run('cat x >> /abs/b.html')).toEqual(['/abs/b.html'])
    expect(run('python gen.py 2>&1 > ~/o/c.png')).toEqual(['/h/o/c.png'])
    expect(run('echo a >d.md')).toEqual(['/w/proj/d.md'])
    expect(run('echo a > "/x/my file.md"')).toEqual(['/x/my file.md'])
  })

  it('takes tee, cp and mv ends, and sources copied into a folder', () => {
    expect(run('ls | tee -a notes.md')).toEqual(['/w/proj/notes.md'])
    expect(run('cp a.png b.png')).toEqual(['/w/proj/b.png'])
    expect(run('mv -f /t/x.pdf ~/docs/y.pdf')).toEqual(['/h/docs/y.pdf'])
    expect(run('cp a.png b.md c.txt /out/')).toEqual(['/out/a.png', '/out/b.md'])
  })

  it('follows cd, and joins the steps of one line', () => {
    expect(run('cd /x/y && echo a > z.md; cp z.md ../w.md')).toEqual(['/x/y/z.md', '/x/w.md'])
  })

  it('leaves out other kinds, variables, patterns, stderr redirects and heredoc bodies', () => {
    expect(run('echo a > run.log')).toEqual([])
    expect(run('echo a > $OUT/a.md')).toEqual([])
    expect(run('cp *.png /out/a.png')).toEqual(['/out/a.png'])
    expect(run('cp *.png out')).toEqual([])
    expect(run('cmd 2>/dev/null')).toEqual([])
    expect(run('node a.js >&2')).toEqual([])
    expect(run("cat > a.md <<'EOF'\nx > not.md\nEOF")).toEqual(['/w/proj/a.md'])
  })

  it('reads HOME as the home folder', () => {
    expect(run('echo > $HOME/a.md')).toEqual(['/h/a.md'])
    expect(run('echo > ${HOME}/b.md')).toEqual(['/h/b.md'])
  })
})

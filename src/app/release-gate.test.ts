// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { format } from 'prettier';
import { build } from 'vite';
import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', { history: { replaceState() {} } });

const workflowPath = resolve('.github/workflows/ci-pages.yml');
const defaultPush =
  "github.event_name == 'push' && github.ref == 'refs/heads/main'";
const publication = `(${defaultPush} || (github.event_name == 'workflow_dispatch' && startsWith(github.ref, 'refs/heads/')))`;

async function readWorkflow(): Promise<string> {
  return (await readFile(workflowPath, 'utf8')).replace(/\r\n/g, '\n');
}

function job(workflow: string, name: string): string {
  const section = workflow.match(
    new RegExp(
      `^  ${name}:\\n[\\s\\S]*?(?=^  \\w[\\w-]*:\\n|$(?![\\s\\S]))`,
      'm',
    ),
  )?.[0];
  if (!section) throw new Error(`Missing ${name} job.`);
  return section;
}

describe('static demo release gate', () => {
  it('allows checked main pushes and manual branches but no PR, automatic feature push or tag publication', async () => {
    const workflow = await readWorkflow();
    await expect(format(workflow, { parser: 'yaml' })).resolves.toBeTruthy();
    expect(workflow).toMatch(/pull_request:/);
    expect(workflow).toMatch(/push:\n {4}branches: \[main\]/);
    expect(workflow).not.toMatch(/pull_request_target/);
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
    const checks = job(workflow, 'checks');
    expect(checks).not.toMatch(/pages: write|id-token: write/);
    const deploy = job(workflow, 'deploy');
    expect(deploy).toMatch(/needs: checks/);
    expect(deploy).toMatch(
      /permissions:\n {6}contents: read\n {6}pages: write\n {6}id-token: write/,
    );
    expect(deploy).toMatch(/environment:\n {6}name: github-pages/);
    expect(deploy).toContain('actions/deploy-pages@v4');
    expect(deploy).not.toMatch(/npm |actions\/checkout/);
    expect(deploy).toMatch(
      /concurrency:\n {6}group: static-demo-pages\n {6}cancel-in-progress: false/,
    );
    expect(checks).toContain(
      'group: static-demo-checks-${{ github.workflow }}-${{ github.ref }}',
    );
    expect(workflow).not.toMatch(/^concurrency:/m);

    const expression = deploy.match(/if: \$\{\{ (.+) \}\}/)?.[1];
    if (!expression) throw new Error('Missing Pages deployment guard.');
    expect(expression).toBe(
      `${publication} && needs.checks.result == 'success'`,
    );
    for (const [event, ref, result, allowed] of [
      ['push', 'refs/heads/main', 'success', true],
      ['pull_request', 'refs/heads/main', 'success', false],
      ['pull_request', 'refs/pull/42/merge', 'success', false],
      ['push', 'refs/heads/feature/demo', 'success', false],
      ['push', 'refs/heads/main', 'failure', false],
      ['push', 'refs/heads/main', 'cancelled', false],
      ['push', 'refs/heads/main', 'skipped', false],
      ['workflow_dispatch', 'refs/heads/feature/demo', 'success', true],
      ['workflow_dispatch', 'refs/heads/main', 'success', true],
      ['workflow_dispatch', 'refs/tags/v1', 'success', false],
      ['workflow_dispatch', 'refs/heads/feature/demo', 'failure', false],
      ['workflow_dispatch', 'refs/heads/feature/demo', 'cancelled', false],
      ['workflow_dispatch', 'refs/heads/feature/demo', 'skipped', false],
    ]) {
      expect(
        runInNewContext(expression, {
          github: { event_name: event, ref },
          needs: { checks: { result } },
          startsWith: (text: string, prefix: string) => text.startsWith(prefix),
        }),
      ).toBe(allowed);
    }
  });

  it('installs Chromium before unit tests and gates artifact upload on every quality check', async () => {
    const checks = job(await readWorkflow(), 'checks');
    const orderedGates = [
      'npm ci',
      'npx playwright install --with-deps chromium',
      'npm run format:check',
      'npm run lint',
      'npm run typecheck',
      'npm test',
      'npm run build',
      "npx playwright test --grep '@smoke'",
      'run: npx playwright test\n',
      'actions/upload-pages-artifact@v3',
    ];
    let previous = -1;
    for (const gate of orderedGates) {
      const index = checks.indexOf(gate);
      expect(index, `Missing or unordered gate: ${gate}`).toBeGreaterThan(
        previous,
      );
      previous = index;
    }
    expect(checks).toMatch(
      /if: github.event_name == 'pull_request'\n {8}run: npx playwright test --grep '@smoke'/,
    );
    expect(checks).toMatch(
      /if: github.event_name == 'push' \|\| github.event_name == 'workflow_dispatch'\n {8}run: npx playwright test\n/,
    );
    expect(checks).toContain(`if: \${{ ${publication} }}`);
    expect(checks).toMatch(/path: dist/);
    expect(checks).toMatch(/PAGES_BASE_PATH: \/gym-operations\//);
    expect(checks).not.toMatch(
      /continue-on-error|always\(\)|--passWithNoTests|secrets\.|chunkSizeWarningLimit/,
    );
  });

  it('builds existing repository-base assets containing fictional fixtures rather than operational integrations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gym-static-release-'));
    try {
      vi.stubEnv('NODE_ENV', 'production');
      await build({
        configFile: resolve('vite.config.ts'),
        mode: 'production',
        build: { outDir: directory },
      });
      const html = await readFile(join(directory, 'index.html'), 'utf8');
      const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(
        (match) => match[1],
      );
      expect(references.length).toBeGreaterThan(0);
      for (const reference of references) {
        expect(reference).toMatch(/^\/gym-operations\/assets\//);
        await expect(
          readFile(join(directory, reference.slice('/gym-operations/'.length))),
        ).resolves.toBeTruthy();
      }
      const files = (await readdir(directory, { recursive: true })).filter(
        (file) => /\.(?:html|css|js)$/.test(file),
      );
      const text = (
        await Promise.all(
          files.map((file) => readFile(join(directory, file), 'utf8')),
        )
      ).join('\n');
      expect(text).toContain('Demo · resets on refresh');
      expect(text).toContain('maya.chen@example.invalid');
      expect(text).toContain('America/Los_Angeles');
      expect(text).not.toMatch(
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,}/,
      );
      expect(text).not.toMatch(
        /login\.microsoftonline\.com|accounts\.google\.com|cognito-idp\.|api\.(?:sendgrid|mailgun)\.|@auth0\/|@azure\/msal|@supabase\/|firebase\/auth/,
      );
      const staticReferences = new Set([
        'http://localhost',
        'http://www.w3.org/1998/Math/MathML',
        'http://www.w3.org/1999/xlink',
        'http://www.w3.org/2000/svg',
        'http://www.w3.org/XML/1998/namespace',
        'https://react.dev/errors/',
        'https://reactrouter.com/en/main/routers/picking-a-router.',
      ]);
      const urls = text.match(/https?:\/\/[^\s"'`<>\\)]+/g) ?? [];
      expect(
        [...new Set(urls)].filter((url) => !staticReferences.has(url)),
      ).toEqual([]);
      const emails = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? [];
      expect(emails.length).toBeGreaterThan(0);
      expect(emails.every((email) => email.endsWith('.invalid'))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true });
    }
  }, 60_000);
});

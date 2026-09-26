// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('GitHub Pages workflow', () => {
  it('deploys only a successful main CI SHA and does not try to enable Pages with GITHUB_TOKEN', () => {
    const workflow = readFileSync('.github/workflows/pages.yml', 'utf8');

    expect(workflow).toContain('workflow_run:');
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain('ref: ${{ github.event.workflow_run.head_sha }}');
    expect(workflow).not.toContain('enablement: true');
  });
});

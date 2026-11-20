import type { DemoScript } from '@x10/shared/demo';

/** Label text, allowing the required-field asterisk. */
const field = (name: string) => new RegExp(`^${name}\\s*\\*?$`);

const OPEN_INCIDENT = 'Orders ingest failed after a source column was renamed';

export const script: DemoScript = {
  title: 'Postmortem Pad: pipeline failures on a seismograph, with a black box for every incident',
  persona: 'demo-lead',
  scenes: [
    {
      id: 'hook',
      say: [
        'This is Postmortem Pad, a Fabric App where every pipeline failure of the last ninety days is a tremor on its system’s trace.',
        'Height is severity, the ring is time to resolve, and open incidents keep trembling up to the stylus.',
      ],
      async run(h) {
        await h.goto('/');
        await h.spotlight(h.page.getByTestId('seismograph'), 4000);
        await h.hover(h.page.locator('[data-incident]').nth(8));
        await h.pause(2500);
      },
    },
    {
      id: 'lenses',
      say: [
        'Switch the lens to category and one pattern jumps out: orders ingest keeps breaking on schema changes.',
        'The time to resolve lens shows which recoveries dragged on.',
      ],
      async run(h) {
        await h.click(h.page.getByRole('radio', { name: /^Category/ }));
        await h.spotlight(h.page.locator('[data-track="Sales orders ingest"]'), 3500);
        await h.click(h.page.getByRole('radio', { name: /^Time to resolve/ }));
        await h.pause(2500);
      },
    },
    {
      id: 'today',
      say: [
        'Today ranks what needs attention now: the most severe open incident, the aging ones, and overdue follow-ups.',
        'One click focuses the drum on it and switches to the lens that explains it.',
      ],
      async run(h) {
        const today = h.page.getByRole('complementary', { name: 'Today' });
        await h.spotlight(today, 2500);
        await h.click(today.getByRole('button', { name: /ran out of memory/ }));
        await h.spotlight(h.page.getByTestId('focus-card'), 2500);
        await h.click(today.getByRole('button', { name: /keeps shaking/ }));
        await h.pause(2500);
      },
    },
    {
      id: 'view-as',
      say: ['Viewing as an engineer dims everything that is not mine and puts my own follow-ups first.'],
      async run(h) {
        await h.click(h.page.getByRole('radio', { name: 'Engineer' }));
        await h.pause(3500);
        await h.click(h.page.getByRole('radio', { name: 'Lead' }));
      },
    },
    {
      id: 'black-box',
      say: [
        'Each incident opens as a black box: started, detected, now, and the time between each mark.',
        'The transcript highlights wording that points at a person, with a blameless prompt right beside it.',
      ],
      async run(h) {
        await h.click(h.page.getByRole('radio', { name: 'Log', exact: true }));
        await h.click(h.page.getByRole('link', { name: OPEN_INCIDENT }));
        await h.spotlight(h.page.getByTestId('timeline'), 3500);
        await h.scrollTo(h.page.getByTestId('blameless-note'));
        await h.spotlight(h.page.getByTestId('blameless-note'), 3000);
      },
    },
    {
      id: 'resolve',
      say: [
        'To resolve it I give three facts: when it was fixed, why it happened and what fixed it.',
        'The category checklist on its own does not count as a root cause, so the app stops me there.',
        'With a real root cause the recorder stops, and the tremor rings down on the drum.',
      ],
      async run(h) {
        await h.click(h.page.getByRole('button', { name: 'Mark resolved' }).first());
        const dialog = h.page.getByRole('dialog', { name: 'Mark resolved' });
        await h.type(dialog.getByLabel(field('Fix')), 'Remapped the column by name and reloaded.');
        await h.click(dialog.getByRole('button', { name: 'Mark resolved' }));
        await h.spotlight(dialog.getByText(/Add a root cause to resolve this incident/), 2500);
        await h.fill(dialog.getByLabel(field('Root cause')), 'The source renamed a column with no notice, and our mapping had no schema check.');
        await h.click(dialog.getByRole('button', { name: 'Mark resolved' }));
        await h.scrollTo(h.page.getByTestId('timeline'));
        await h.spotlight(h.page.getByTestId('timeline'), 3000);
      },
    },
    {
      id: 'aftershocks',
      say: [
        'Follow-ups are aftershocks: small spikes after a tremor, red when they are overdue.',
        'The aftershocks page groups them by owner, overdue first, and ticking one off is instant, with undo.',
      ],
      async run(h) {
        await h.goto('/actions');
        await h.spotlight(h.page.getByTestId('owner-group').first(), 3000);
        await h.click(h.page.getByRole('checkbox', { name: 'Alert on column-count drift in the orders source' }));
        await h.pause(2500);
      },
    },
    {
      id: 'fault-lines',
      say: ['Fault lines shows the patterns: schema changes lead, and Monday mornings are when things break.'],
      async run(h) {
        await h.goto('/trends');
        await h.scrollTo(h.page.getByTestId('heatmap'));
        await h.spotlight(h.page.getByTestId('heatmap'), 4000);
      },
    },
    {
      id: 'takeaway',
      say: ['Log it in two minutes, keep the wording blameless, and let the seismograph show you what to fix next.'],
      async run(h) {
        await h.goto('/');
        await h.pause(4000);
      },
    },
  ],
};

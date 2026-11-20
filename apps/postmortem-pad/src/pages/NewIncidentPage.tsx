import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp } from '@x10/shared/runtime';
import { normKey, useAsync } from '@x10/shared/lib';
import { Breadcrumb, PageHeader } from '@x10/shared/ui';

import { TremorPreview } from '../components/TremorPreview';
import { IncidentForm } from '../components/IncidentForm';
import { blankInput, createIncident, listIncidents } from '../domain/incidents';
import { distinctSystems } from '../domain/log';
import { inWindow } from '../domain/seismo';
import type { Schema } from '../model';

export function NewIncidentPage() {
  const { store, me } = useApp<Schema>();
  const navigate = useNavigate();
  const initial = useMemo(() => blankInput(new Date()), []);
  const now = useMemo(() => new Date(), []);
  // System suggestions and the preview are conveniences: the form works without them, so nothing blocks typing.
  const all = useAsync(() => listIncidents(store), [store]);
  const systems = useMemo(() => distinctSystems(all.data ?? []), [all.data]);
  const windowed = useMemo(() => inWindow(all.data ?? [], now), [all.data, now]);
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumb items={[{ label: 'Seismograph', to: '/' }, { label: 'New incident' }]} />}
        title={<span className="x-serif text-[40px] font-normal leading-tight">Log an incident</span>}
        subtitle="Five fields and it is on the seismograph. The story can wait."
      />
      <IncidentForm
        initial={initial}
        systems={systems}
        submitLabel="Save incident"
        onCancel={() => navigate('/')}
        onSubmit={async (v) => {
          const created = await createIncident(store, me, v);
          navigate(`/incidents/${created.id}?saved=1`);
        }}
        aside={(v) => <TremorPreview value={v} incidents={windowed.filter((i) => v.system.trim() && normKey(i.system) === normKey(v.system))} now={now} />}
      />
    </>
  );
}

import { Link, useNavigate, useParams } from 'react-router-dom';

import { useApp } from '@x10/shared/runtime';
import { useAsync } from '@x10/shared/lib';
import { Breadcrumb, DataState, EmptyState, PageHeader, Skeleton } from '@x10/shared/ui';

import { StatusChip } from '../components/chips';
import { IncidentForm } from '../components/IncidentForm';
import { getIncidentDetail, isLead, listIncidents, toInput, updateIncident } from '../domain/incidents';
import { distinctSystems } from '../domain/log';
import type { Schema } from '../model';

export function EditIncidentPage() {
  const { id = '' } = useParams();
  const { store, me } = useApp<Schema>();
  const navigate = useNavigate();
  const state = useAsync(async () => {
    const [detail, all] = await Promise.all([getIncidentDetail(store, id), listIncidents(store)]);
    return { incident: detail.incident, systems: distinctSystems(all) };
  }, [store, id]);
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumb items={[{ label: 'Seismograph', to: '/' }, { label: 'Black box', to: `/incidents/${id}` }, { label: 'Edit' }]} />}
        title={<span className="x-serif text-[40px] font-normal leading-tight">Edit incident</span>}
        meta={state.data && <span className="truncate">{state.data.incident.title}</span>}
      />
      <DataState
        state={state}
        skeleton={
          <div className="space-y-4">
            <Skeleton width={180} height={12} />
            <Skeleton height={56} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton height={56} />
              <Skeleton height={56} />
              <Skeleton height={56} />
              <Skeleton height={56} />
            </div>
            <Skeleton height={240} />
          </div>
        }
      >
        {({ incident, systems }) =>
          incident.status === 'reviewed' && !isLead(me) ? (
            <EmptyState
              title="This incident is reviewed"
              action={<Link to={`/incidents/${id}`}>Back to the black box</Link>}
            >
              A lead has signed it off. Only a lead can edit or reopen it.
            </EmptyState>
          ) : (
          <IncidentForm
            initial={toInput(incident)}
            systems={systems}
            submitLabel="Save changes"
            detailsInitiallyOpen
            lockedStatus={
              incident.status === 'reviewed' ? (
                <div className="flex flex-wrap items-center gap-2 pt-2 text-sm text-muted">
                  <StatusChip status="reviewed" /> Use Reopen on the incident page to change it.
                </div>
              ) : undefined
            }
            onCancel={() => navigate(`/incidents/${id}`)}
            onSubmit={async (v) => {
              await updateIncident(store, me, id, v);
              navigate(`/incidents/${id}`);
            }}
          />
          )
        }
      </DataState>
    </>
  );
}

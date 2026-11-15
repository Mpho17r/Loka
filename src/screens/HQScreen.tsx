import { AdMedia, ProofLink, ScanBadge } from '../components/media';
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, Card, ChipRow, Empty, Field, H2, Muted, Row, Screen, StatusPill } from '../components/ui';
import { colors } from '../theme';
import { PLACEMENTS, formatZAR } from '../lib/pricing';
import { useApp } from '../store/AppState';
import { statusTone } from './CampaignDetailScreen';
import type { Campaign, Verification } from '../types';

const SECTIONS = ['Review', 'Payments', 'Live', 'Finance', 'Complaints', 'Messages', 'Accounts', 'Managed', 'Revenue'];
const label = (id: string) => PLACEMENTS.find((p) => p.id === id)?.label ?? id;

/**
 * Saccharum HQ advertising control centre. What each person can actually do is decided by the database
 * (their staff role and country), not by this screen: buttons for actions they are not allowed to take simply return an error.
 */
export default function HQScreen() {
  const { api, hq, run, refreshHq, profile } = useApp();
  const [section, setSection] = useState('Review');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => { void refreshHq(); }, [refreshHq]);

  const act = async (fn: () => Promise<unknown>, clear = true) => {
    const err = await run(fn);
    if (err) Alert.alert('Could not do that', err); else if (clear) setReason('');
  };
  const need = (): boolean => {
    if (reason.trim().length < 3) { Alert.alert('Add a reason', 'Write a short reason in the box at the top first.'); return false; }
    return true;
  };
  const amt = Number(amount.replace(',', '.'));
  const refund = async (invoiceId: string) => {
    let outcome = 'refunded' as 'refunded' | 'pending_approval'; // assigned inside the callback below
    const err = await run(async () => { outcome = await api.hqRefund(invoiceId, amt, reason); });
    if (err) { Alert.alert('Could not do that', err); return; }
    setReason(''); setAmount('');
    if (outcome === 'pending_approval') Alert.alert('Sent for approval', 'Refunds this large need a second finance user to approve them. It is listed under "Waiting for a second approver".');
  };

  if (!hq) return <Screen><Empty title="Loading HQ data" body="If this does not load, your account may not have an HQ role." /></Screen>;

  const header = (c: Campaign) => (
    <View>
      <Text style={{ fontWeight: '700', color: colors.ink }}>{c.headline}</Text>
      <Muted>{c.advertiser ?? 'Advertiser'} · {c.targetTitle}</Muted>
      <AdMedia path={c.mediaPath} format={c.format} height={160} />
      <ScanBadge scan={c.scan} />
      <Muted>{label(c.placement)} · {c.city} · {c.impressions.toLocaleString('en-ZA')} impressions · {c.startDate} to {c.endDate}</Muted>
      <View style={{ marginVertical: 6, flexDirection: 'row', gap: 8 }}>
        <StatusPill label={c.status} tone={statusTone(c.status)} />
        <StatusPill label={`${c.invoice.number}: ${c.invoice.status.replace('_', ' ')}`} tone={c.invoice.status === 'verified' ? 'good' : 'warn'} />
      </View>
    </View>
  );

  const pending = hq.campaigns.filter((c) => c.status === 'Pending review');
  const unpaid = hq.campaigns.filter((c) => ['issued', 'paid_declared'].includes(c.invoice.status)
    && !['Rejected', 'Cancelled', 'Terminated', 'Completed'].includes(c.status));
  const running = hq.campaigns.filter((c) => ['Live', 'Paused', 'Scheduled'].includes(c.status));
  const paid = hq.campaigns.filter((c) => c.invoice.status === 'verified' && c.invoice.total > 0);

  return (
    <Screen>
      <Muted style={{ marginBottom: 8 }}>
        Signed in as {profile?.fullName} ({profile?.roles.join(', ')}). Every action is recorded in the audit log.
      </Muted>
      <Field label="Reason or note (needed for reject, change request, pause, terminate, refunds and credit changes)" value={reason} onChangeText={setReason} />
      <ChipRow options={SECTIONS} value={section} onChange={setSection} />

      {section === 'Review' ? (
        <View>
          <H2>Review queue ({pending.length})</H2>
          {pending.length === 0 ? <Empty title="Nothing waiting" body="New campaigns appear here for moderation." /> : null}
          {pending.map((c) => (
            <Card key={c.id}>
              {header(c)}
              <View style={{ gap: 8 }}>
                {c.scan?.status === 'flagged' ? (
                  <Button label="Clear the media flag (I looked at the file)" variant="secondary" onPress={() => need() && act(() => api.hqClearScan(c.id, reason))} />
                ) : null}
                {c.scan && c.scan.status !== 'flagged' ? (
                  <Button label="Block this file for good" variant="secondary" onPress={() => need() && act(() => api.hqBlockMedia(c.id, reason))} />
                ) : null}
                <Button label="Approve" onPress={() => act(() => api.hqReview(c.id, 'approve', 'policy-ok', reason), false)} />
                <Button label="Request changes" variant="secondary" onPress={() => need() && act(() => api.hqReview(c.id, 'changes', 'needs-change', reason))} />
                <Button label="Reject" variant="danger" onPress={() => need() && act(() => api.hqReview(c.id, 'reject', 'policy-breach', reason))} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {section === 'Payments' ? (
        <View>
          <H2>Payments to verify ({unpaid.length})</H2>
          <Muted style={{ marginBottom: 8 }}>Verify only after you have seen the money in the bank. "Declared" means the advertiser says they paid.</Muted>
          {unpaid.length === 0 ? <Empty title="No open invoices" body="Issued and declared invoices appear here." /> : null}
          {unpaid.map((c) => (
            <Card key={c.id}>
              {header(c)}
              <Row label="Invoice total" value={formatZAR(c.invoice.total)} bold />
              <ProofLink path={c.invoice.proofPath} />
              <Button label="Mark payment verified" onPress={() => act(() => api.hqVerifyPayment(c.invoice.id, reason), false)} />
            </Card>
          ))}
        </View>
      ) : null}

      {section === 'Live' ? (
        <View>
          <H2>Running campaigns ({running.length})</H2>
          {running.length === 0 ? <Empty title="Nothing running" body="Live, paused and scheduled campaigns appear here." /> : null}
          {running.map((c) => (
            <Card key={c.id}>
              {header(c)}
              <Row label="Delivered" value={`${c.delivered.toLocaleString('en-ZA')} · ${c.clicks} clicks`} />
              <View style={{ gap: 8 }}>
                {c.status === 'Paused'
                  ? <Button label="Resume" variant="secondary" onPress={() => need() && act(() => api.hqSetState(c.id, 'resume', reason))} />
                  : <Button label="Pause" variant="secondary" onPress={() => need() && act(() => api.hqSetState(c.id, 'pause', reason))} />}
                <Button label="Terminate" variant="danger" onPress={() => need() && act(() => api.hqSetState(c.id, 'terminate', reason))} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {section === 'Finance' ? (
        <View>
          <H2>Refunds and credits</H2>
          {hq.refunds.length > 0 ? (
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontWeight: '700', color: colors.ink, marginBottom: 6 }}>Waiting for a second approver ({hq.refunds.length})</Text>
              {hq.refunds.map((r) => (
                <Card key={r.id} style={{ borderColor: colors.warn }}>
                  <Row label={r.invoiceNumber} value={formatZAR(r.amount)} bold />
                  <Muted style={{ marginBottom: 8 }}>{r.reason}</Muted>
                  {r.requestedByMe ? (
                    <Muted>You requested this. Another finance user must approve it.</Muted>
                  ) : (
                    <View style={{ gap: 8 }}>
                      <Button label="Approve refund" onPress={() => act(() => api.hqDecideRefund(r.id, true, reason), false)} />
                      <Button label="Reject" variant="danger" onPress={() => need() && act(() => api.hqDecideRefund(r.id, false, reason))} />
                    </View>
                  )}
                </Card>
              ))}
            </View>
          ) : null}
          <Field label="Amount in rand" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          {paid.length === 0 ? <Empty title="No paid invoices" body="Verified invoices appear here." /> : null}
          {paid.map((c) => (
            <Card key={c.id}>
              {header(c)}
              <Row label="Invoice total" value={formatZAR(c.invoice.total)} />
              <View style={{ gap: 8 }}>
                <Button label="Refund the amount above" variant="secondary" onPress={() => need() && amt > 0 && refund(c.invoice.id)} />
                <Button label="Grant the amount above as credit" variant="secondary" onPress={() => need() && amt > 0 && act(() => api.hqAdjustCredit(c.accountId, amt, reason))} />
                <Button label="Revoke the amount above from credit" variant="danger" onPress={() => need() && amt > 0 && act(() => api.hqAdjustCredit(c.accountId, -amt, reason))} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {section === 'Complaints' ? (
        <View>
          <H2>Complaints about adverts</H2>
          {hq.reports.length === 0 ? <Empty title="No complaints" body="Reports from users appear here." /> : null}
          {hq.reports.map((r) => (
            <Card key={r.id}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{r.headline}</Text>
              <Muted style={{ marginVertical: 4 }}>{r.reason}</Muted>
              <StatusPill label={r.status} tone={r.status === 'open' ? 'warn' : 'neutral'} />
              {r.status === 'open' || r.status === 'investigating' ? (
                <View style={{ gap: 8, marginTop: 8 }}>
                  <Button label="Mark investigating" variant="secondary" onPress={() => act(() => api.hqResolveReport(r.id, 'investigating', reason || 'Under investigation'), false)} />
                  <Button label="Action taken" variant="secondary" onPress={() => need() && act(() => api.hqResolveReport(r.id, 'actioned', reason))} />
                  <Button label="Dismiss" variant="secondary" onPress={() => need() && act(() => api.hqResolveReport(r.id, 'dismissed', reason))} />
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}

      {section === 'Messages' ? (
        <View>
          <H2>Reported messages ({hq.messageReports.length})</H2>
          <Muted style={{ marginBottom: 8 }}>You see only the reported message and the few before it. Conversations are private otherwise.</Muted>
          {hq.messageReports.length === 0 ? <Empty title="No reports" body="Reported messages appear here." /> : null}
          {hq.messageReports.map((r) => (
            <Card key={r.id}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{r.reporterName} reported {r.reportedName}</Text>
              <Muted style={{ marginVertical: 4 }}>Reason: {r.reason}</Muted>
              {r.context.map((m, i) => (
                <Text key={i} style={{ color: m.fromReported ? colors.danger : colors.ink, marginVertical: 1 }}>
                  {m.fromReported ? r.reportedName : r.reporterName}: {m.body}
                </Text>
              ))}
              <View style={{ gap: 8, marginTop: 8 }}>
                <Button label="Action taken" variant="secondary" onPress={() => need() && act(() => api.hqResolveMessageReport(r.id, 'actioned', reason))} />
                <Button label="Dismiss" variant="secondary" onPress={() => need() && act(() => api.hqResolveMessageReport(r.id, 'dismissed', reason))} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {section === 'Accounts' ? (
        <View>
          <H2>Accounts</H2>
          <Muted style={{ marginBottom: 8 }}>Only verified accounts can advertise. Check documents before verifying.</Muted>
          {hq.accounts.map((a) => (
            <Card key={a.id}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{a.name}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginVertical: 6 }}>
                <StatusPill label={a.verification} tone={a.verification === 'unverified' ? 'warn' : 'good'} />
                {a.isPremium ? <StatusPill label="premium" tone="good" /> : null}
              </View>
              <View style={{ gap: 8 }}>
                {(['identity', 'business', 'unverified'] as Verification[]).filter((v) => v !== a.verification).map((v) => (
                  <Button key={v} label={`Set ${v}`} variant="secondary" onPress={() => need() && act(() => api.hqSetFlags(a.id, { verification: v }, reason))} />
                ))}
                <Button label={a.isPremium ? 'Remove premium' : 'Make premium'} variant="secondary" onPress={() => need() && act(() => api.hqSetFlags(a.id, { premium: !a.isPremium }, reason))} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {section === 'Managed' ? (
        <View>
          <H2>Managed advertising requests</H2>
          {hq.managed.length === 0 ? <Empty title="No requests" body="Businesses asking Saccharum to run campaigns appear here." /> : null}
          {hq.managed.map((m) => (
            <Card key={m.id}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{m.requester}</Text>
              <Muted style={{ marginVertical: 4 }}>{m.brief}</Muted>
              <StatusPill label={m.status.replace('_', ' ')} tone={m.status === 'new' ? 'warn' : 'neutral'} />
              <View style={{ gap: 8, marginTop: 8 }}>
                <Button label="Start working on it" variant="secondary" onPress={() => act(() => api.hqUpdateManaged(m.id, 'in_progress'), false)} />
                <Button label="Campaign created" variant="secondary" onPress={() => act(() => api.hqUpdateManaged(m.id, 'campaign_created'), false)} />
                <Button label="Decline" variant="secondary" onPress={() => act(() => api.hqUpdateManaged(m.id, 'declined'), false)} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {section === 'Revenue' ? (
        <View>
          <H2>Advertising revenue (last 90 days)</H2>
          {hq.revenue.length === 0 ? <Empty title="No revenue to show" body="Only finance and owner roles can see revenue. It counts verified invoices." /> : null}
          {hq.revenue.map((r) => (
            <Card key={r.placement}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{label(r.placement)}</Text>
              <Row label="Campaigns" value={String(r.campaigns)} />
              <Row label="Impressions" value={r.impressions.toLocaleString('en-ZA')} />
              <Row label="Clicks" value={r.clicks.toLocaleString('en-ZA')} />
              <Row label="Billed before tax" value={formatZAR(r.billedNet)} />
              <Row label="Billed including tax" value={formatZAR(r.billedTotal)} bold />
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

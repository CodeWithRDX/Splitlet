import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, logout } from '../utils/api';
import { useCurrency } from '../utils/currency';
import SettingsModal from '../components/SettingsModal';

export default function Dashboard({ user, onLogout }) {
  const { prefUser, formatInrCents } = useCurrency();
  const activeUser = prefUser || user;
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [groups, setGroups] = useState([]);
  const [globalBalances, setGlobalBalances] = useState({
    netBalanceCents: 0,
    totalOwedCents: 0,
    totalOwesCents: 0,
    groupBalances: [],
    pairwiseBalancesCombined: []
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteEmails, setInviteEmails] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Quick Invite Widget State
  const [widgetGroupId, setWidgetGroupId] = useState('');
  const [widgetEmail, setWidgetEmail] = useState('');
  const [widgetSuccess, setWidgetSuccess] = useState('');
  const [widgetError, setWidgetError] = useState('');
  const [widgetSubmitting, setWidgetSubmitting] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Pre-select the first group in the dropdown when groups load
  useEffect(() => {
    if (groups.length > 0 && !widgetGroupId) {
      setWidgetGroupId(groups[0].id);
    }
  }, [groups, widgetGroupId]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const groupsData = await apiFetch('/api/groups');
      const balancesData = await apiFetch('/api/balances');
      
      setGroups(groupsData);
      setGlobalBalances(balancesData);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setError('');

    const emailsArray = inviteEmails
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0);

    try {
      await apiFetch('/api/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: newGroupName,
          emails: emailsArray
        })
      });

      // Reset form & reload
      setNewGroupName('');
      setInviteEmails('');
      setShowCreateModal(false);
      fetchDashboardData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleWidgetInvite = async (e) => {
    e.preventDefault();
    setWidgetSuccess('');
    setWidgetError('');
    
    if (!widgetGroupId) {
      setWidgetError('Please select a group first.');
      return;
    }
    if (!widgetEmail) {
      setWidgetError('Please enter an email.');
      return;
    }

    setWidgetSubmitting(true);
    try {
      const data = await apiFetch(`/api/groups/${widgetGroupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: widgetEmail })
      });

      setWidgetSuccess(
        data.member.status === 'pending'
          ? `Invitation sent to ${widgetEmail}! A placeholder account has been created.`
          : `${widgetEmail} added to the group successfully!`
      );
      setWidgetEmail('');
      fetchDashboardData();
    } catch (err) {
      setWidgetError(err.message);
    } finally {
      setWidgetSubmitting(false);
    }
  };

  const getBalanceStyle = (cents) => {
    if (cents > 0) return 'bal-positive';
    if (cents < 0) return 'bal-negative';
    return 'bal-zero';
  };

  const formatCents = (cents) => {
    return formatInrCents(cents);
  };

  const getGroupBalanceCents = (groupId) => {
    const groupBal = globalBalances.groupBalances.find(gb => gb.groupId === groupId);
    return groupBal ? groupBal.userSummary.netBalanceCents : 0;
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }}>Loading ledger summary...</div>;
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <Link to="/" className="logo-section">
          <div className="logo-icon">S</div>
          <span>Splitlet</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <span>Hello, <strong>{activeUser.name}</strong></span>
          <button className="btn btn-secondary" onClick={() => setShowSettingsModal(true)}>
            Settings
          </button>
          <button className="btn btn-secondary" onClick={() => { logout(); onLogout(); }}>
            Log Out
          </button>
        </div>
      </header>

      {/* Global Balance Card */}
      <div className="glass-panel balance-card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Total Balance
        </h2>
        <div className={`balance-value ${getBalanceStyle(globalBalances.netBalanceCents)}`}>
          {globalBalances.netBalanceCents < 0 ? '-' : ''}
          {formatCents(globalBalances.netBalanceCents)}
        </div>
        
        <div className="balance-breakdown">
          <div className="breakdown-item">
            <span className="breakdown-label">you are owed</span>
            <span className="breakdown-value bal-positive">{formatCents(globalBalances.totalOwedCents)}</span>
          </div>
          <div className="breakdown-item" style={{ borderLeft: '1px solid var(--panel-border)', paddingLeft: '32px', paddingRight: '32px' }}>
            <span className="breakdown-label">you owe</span>
            <span className="breakdown-value bal-negative">{formatCents(globalBalances.totalOwesCents)}</span>
          </div>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="dashboard-grid">
        {/* Left Column: Peers Detail & Invite Widget */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Peers detail */}
          <div className="glass-panel">
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Direct Debts Overview</h3>
            <div className="list-items" style={{ gap: '10px' }}>
              {globalBalances.pairwiseBalancesCombined.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>All settled up! No active debts with friends.</p>
              ) : (
                globalBalances.pairwiseBalancesCombined.map((pb, index) => (
                  <div key={index} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.01)',
                    borderRadius: '10px',
                    fontSize: '14px'
                  }}>
                    <span>{pb.peerName}</span>
                    <span className={pb.status === 'owed' ? 'bal-positive' : 'bal-negative'}>
                      {pb.status === 'owed' ? 'owes you ' : 'you owe '}
                      {formatCents(pb.amountCents)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Invite Widget */}
          <div className="glass-panel">
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Quick Invite Peer</h3>
            {widgetSuccess && <div className="alert alert-success">{widgetSuccess}</div>}
            {widgetError && <div className="alert alert-danger">{widgetError}</div>}

            {groups.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Create a group first to invite members.</p>
            ) : (
              <form onSubmit={handleWidgetInvite}>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label">Select Group</label>
                  <select
                    className="form-input"
                    value={widgetGroupId}
                    onChange={(e) => setWidgetGroupId(e.target.value)}
                    required
                  >
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label">Friend's Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="friend@email.com"
                    value={widgetEmail}
                    onChange={(e) => setWidgetEmail(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={widgetSubmitting}>
                  {widgetSubmitting ? 'Inviting...' : 'Send Invitation'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right Column: Groups List */}
        <div className="glass-panel">
          <div className="list-header">
            <h3 style={{ fontSize: '20px', fontWeight: 600 }}>Groups</h3>
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              Create Group
            </button>
          </div>

          <div className="list-items">
            {groups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                <p>You aren't in any groups yet.</p>
                <p style={{ fontSize: '14px', marginTop: '4px' }}>Create one above to start splitting expenses!</p>
              </div>
            ) : (
              groups.map((group) => {
                const bal = getGroupBalanceCents(group.id);
                return (
                  <Link to={`/group/${group.id}`} key={group.id} className="list-item">
                    <div className="item-info">
                      <span className="item-name">{group.name}</span>
                      <span className="item-meta">Created on {new Date(group.created_at).toLocaleDateString()}</span>
                    </div>
                    <div>
                      {bal > 0 && <span className="bal-positive">owes you {formatCents(bal)}</span>}
                      {bal < 0 && <span className="bal-negative">you owe {formatCents(bal)}</span>}
                      {bal === 0 && <span className="bal-zero">settled up</span>}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h3 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '20px' }}>Create New Group</h3>
            {error && <div className="alert alert-danger">{error}</div>}
            
            <form onSubmit={handleCreateGroup}>
              <div className="form-group">
                <label className="form-label">Group Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., Roommates, Roadtrip 2026"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Invite Members (emails, comma-separated)</label>
                <textarea
                  className="form-input"
                  placeholder="e.g., alice@test.com, bob@test.com"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  value={inviteEmails}
                  onChange={(e) => setInviteEmails(e.target.value)}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>
                  Invited users must already have registered accounts to be added.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '28px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowCreateModal(false); setError(''); }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettingsModal} 
        onClose={() => setShowSettingsModal(false)} 
      />
    </div>
  );
}

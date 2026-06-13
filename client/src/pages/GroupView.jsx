import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { apiFetch, getUser } from '../utils/api';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5001' : window.location.origin);

export default function GroupView() {
  const { id } = useParams();
  const groupId = parseInt(id, 10);
  const currentUser = getUser();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals visibility
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [activeExpense, setActiveExpense] = useState(null); // Shows expense detail & chat

  // Forms state
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState(''); // dollar string, e.g. "10.00"
  const [expensePayer, setExpensePayer] = useState(currentUser?.id || '');
  const [splitType, setSplitType] = useState('equal');
  
  // Splits config map: { [userId]: { selected, value } }
  // value represents amount ($), percentage (%), or shares depending on splitType
  const [memberSplits, setMemberSplits] = useState({});

  // Settle Up Form
  const [settlePayer, setSettlePayer] = useState('');
  const [settleReceiver, setSettleReceiver] = useState('');
  const [settleAmount, setSettleAmount] = useState('');

  // Add Member Form
  const [newMemberEmail, setNewMemberEmail] = useState('');

  // Chat State
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchGroupDetails();
  }, [groupId]);

  // Setup/Cleanup Socket.io connection for chat
  useEffect(() => {
    if (activeExpense) {
      socketRef.current = io(SOCKET_URL);
      
      socketRef.current.emit('join_expense', activeExpense.id);

      // Fetch latest messages from API to ensure sync
      apiFetch(`/api/expenses/${activeExpense.id}`).then(data => {
        setMessages(data.comments || []);
      }).catch(err => console.error(err));

      socketRef.current.on('new_message', (msg) => {
        setMessages(prev => [...prev, msg]);
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.emit('leave_expense', activeExpense.id);
          socketRef.current.disconnect();
        }
      };
    }
  }, [activeExpense]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchGroupDetails = async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/api/groups/${groupId}`);
      setGroup(data);
      
      // Auto pre-populate settle form with members
      if (data.members.length > 0) {
        setSettlePayer(data.members[0].id);
        const nextMember = data.members[1] || data.members[0];
        setSettleReceiver(nextMember.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Pre-initialize memberSplits map when modal opens or members change
  const initSplitsState = (expenseToEdit = null) => {
    const defaultState = {};
    
    if (expenseToEdit) {
      setEditingExpenseId(expenseToEdit.id);
      setExpenseDesc(expenseToEdit.description);
      setExpenseAmount((expenseToEdit.amount_cents / 100).toFixed(2));
      setExpensePayer(expenseToEdit.payer_id);
      setSplitType(expenseToEdit.split_type);

      group.members.forEach(m => {
        const existingSplit = expenseToEdit.splits.find(s => s.userId === m.id);
        defaultState[m.id] = {
          selected: !!existingSplit,
          value: existingSplit 
            ? expenseToEdit.split_type === 'unequal'
              ? (existingSplit.amountOwedCents / 100).toFixed(2)
              : expenseToEdit.split_type === 'percentage'
                ? existingSplit.percentage
                : existingSplit.shares
            : ''
        };
      });
    } else {
      setEditingExpenseId(null);
      setExpenseDesc('');
      setExpenseAmount('');
      setExpensePayer(currentUser?.id || group.members[0]?.id || '');
      setSplitType('equal');

      group.members.forEach(m => {
        defaultState[m.id] = {
          selected: true,
          value: ''
        };
      });
    }
    setMemberSplits(defaultState);
  };

  const openExpenseModal = (expense = null) => {
    initSplitsState(expense);
    setShowExpenseModal(true);
  };

  const handleSplitCheckboxChange = (userId) => {
    setMemberSplits(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        selected: !prev[userId].selected
      }
    }));
  };

  const handleSplitValueChange = (userId, value) => {
    setMemberSplits(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        value
      }
    }));
  };

  // Form submission for Expenses (Create/Edit)
  const handleSaveExpense = async (e) => {
    e.preventDefault();
    setError('');

    const amtCents = Math.round(parseFloat(expenseAmount) * 100);
    if (isNaN(amtCents) || amtCents <= 0) {
      setError('Please enter a valid expense amount.');
      return;
    }

    const selectedMembers = Object.keys(memberSplits).filter(id => memberSplits[id].selected);
    if (selectedMembers.length === 0) {
      setError('At least one member must be selected in the split.');
      return;
    }

    // Map frontend states into api payload splits
    const splitsPayload = selectedMembers.map(userIdStr => {
      const uId = parseInt(userIdStr, 10);
      const conf = memberSplits[uId];
      const res = { userId: uId };

      if (splitType === 'unequal') {
        res.amountCents = Math.round(parseFloat(conf.value || 0) * 100);
      } else if (splitType === 'percentage') {
        res.percentage = parseFloat(conf.value || 0);
      } else if (splitType === 'shares') {
        res.shares = parseFloat(conf.value || 1);
      }
      return res;
    });

    const payload = {
      groupId,
      description: expenseDesc,
      amountCents: amtCents,
      splitType,
      payerId: parseInt(expensePayer, 10),
      splits: splitsPayload
    };

    try {
      if (editingExpenseId) {
        await apiFetch(`/api/expenses/${editingExpenseId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch('/api/expenses', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      setShowExpenseModal(false);
      fetchGroupDetails();
      if (activeExpense && activeExpense.id === editingExpenseId) {
        setActiveExpense(null); // Reset detail panel if we updated it
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Delete Expense (Soft Delete)
  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Are you sure you want to delete this expense? This will remove its financial impact.')) return;
    try {
      await apiFetch(`/api/expenses/${expenseId}`, { method: 'DELETE' });
      fetchGroupDetails();
      if (activeExpense?.id === expenseId) {
        setActiveExpense(null);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Save Settlement
  const handleSaveSettlement = async (e) => {
    e.preventDefault();
    setError('');

    const amtCents = Math.round(parseFloat(settleAmount) * 100);
    if (isNaN(amtCents) || amtCents <= 0) {
      setError('Please enter a valid payment amount.');
      return;
    }

    try {
      await apiFetch('/api/settlements', {
        method: 'POST',
        body: JSON.stringify({
          groupId,
          payerId: parseInt(settlePayer, 10),
          receiverId: parseInt(settleReceiver, 10),
          amountCents: amtCents
        })
      });

      setSettleAmount('');
      setShowSettleModal(false);
      fetchGroupDetails();
    } catch (err) {
      setError(err.message);
    }
  };

  // Add Member
  const handleAddMember = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await apiFetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: newMemberEmail })
      });

      setNewMemberEmail('');
      setShowMemberModal(false);
      fetchGroupDetails();
    } catch (err) {
      setError(err.message);
    }
  };

  // Remove Member
  const handleRemoveMember = async (memberId) => {
    const memberName = group.members.find(m => m.id === memberId)?.name;
    if (!window.confirm(`Are you sure you want to remove ${memberName} from this group?`)) return;

    try {
      await apiFetch(`/api/groups/${groupId}/members/${memberId}`, {
        method: 'DELETE'
      });
      fetchGroupDetails();
    } catch (err) {
      alert(err.message);
    }
  };

  // Send Chat Message
  const handleSendChatMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !socketRef.current) return;

    socketRef.current.emit('send_message', {
      expenseId: activeExpense.id,
      userId: currentUser.id,
      userName: currentUser.name,
      content: newMessage.trim()
    });

    setNewMessage('');
  };

  const formatCents = (cents, currency = 'INR') => {
    const symbol = currency === 'USD' ? '$' : '₹';
    return `${symbol}${(Math.abs(cents) / 100).toFixed(2)}`;
  };

  const formatSplitCents = (splits, userId, currency = 'INR') => {
    const userSplit = splits.find(s => s.userId === userId);
    if (!userSplit) return '₹0.00';
    const hasOriginal = userSplit.amountOwedCentsOriginal !== undefined && userSplit.amountOwedCentsOriginal !== userSplit.amountOwedCents;
    const origStr = hasOriginal ? ` (${formatCents(userSplit.amountOwedCentsOriginal, currency)})` : '';
    return `${formatCents(userSplit.amountOwedCents, 'INR')}${origStr}`;
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }}>Loading group ledger...</div>;
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header" style={{ marginBottom: '16px' }}>
        <Link to="/" className="logo-section" style={{ textDecoration: 'none' }}>
          <div className="logo-icon">S</div>
          <span>Splitlet</span>
        </Link>
        <Link to="/" className="btn btn-secondary">
          ← Back to Dashboard
        </Link>
      </header>

      {/* Group Title Panel */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 700 }}>{group?.name}</h2>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Group Ledger · Created {new Date(group?.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={() => navigate(`/group/${groupId}/import`)}>
            Import CSV
          </button>
          <button className="btn btn-secondary" onClick={() => openExpenseModal()}>
            Add Expense
          </button>
          <button className="btn btn-primary" onClick={() => setShowSettleModal(true)}>
            Settle Up
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: '24px' }}>{error}</div>}

      {/* Main Content Layout */}
      <div className="expense-layout">
        {/* Left Side: Expenses & Settlements Feed */}
        <div className="glass-panel">
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>Transactions Feed</h3>

          {group?.expenses.length === 0 && group?.settlements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
              <p>No expenses or payments recorded yet.</p>
              <p style={{ fontSize: '14px', marginTop: '4px' }}>Click "Add Expense" or "Settle Up" to begin.</p>
            </div>
          ) : (
            <div className="expense-feed">
              {/* Merge and sort expenses & settlements by date */}
              {[
                ...group.expenses.map(e => ({ ...e, feedType: 'expense' })),
                ...group.settlements.map(s => ({ ...s, feedType: 'settlement' }))
              ]
                .sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp))
                .map((item) => {
                  const date = new Date(item.created_at || item.timestamp);
                  const monthName = date.toLocaleString('default', { month: 'short' });
                  const day = date.getDate();

                  if (item.feedType === 'settlement') {
                    return (
                      <div key={`settle-${item.id}`} className="expense-item" style={{ borderLeft: '3px solid var(--primary)', background: 'rgba(16, 185, 129, 0.02)' }}>
                        <div className="expense-main">
                          <div className="expense-date">
                            <span>{monthName}</span>
                            <div className="day">{day}</div>
                          </div>
                          <div className="expense-details">
                            <span className="expense-desc">Payment settled</span>
                            <span className="expense-payer">
                              <strong>{item.payer_name}</strong> paid <strong>{item.receiver_name}</strong>
                            </span>
                          </div>
                        </div>
                        <div className="expense-amount-info">
                          <span className="expense-total bal-positive" style={{ color: 'var(--primary)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            {formatCents(item.amount_cents, 'INR')}
                            {item.currency_code && item.currency_code !== 'INR' && (
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                                ({formatCents(item.amount_cents_original, item.currency_code)})
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={`expense-${item.id}`} className="expense-item" style={{ cursor: 'pointer' }} onClick={() => setActiveExpense(item)}>
                      <div className="expense-main">
                        <div className="expense-date">
                          <span>{monthName}</span>
                          <div className="day">{day}</div>
                        </div>
                        <div className="expense-details">
                          <span className="expense-desc">{item.description}</span>
                          <span className="expense-payer">
                            Paid by <strong>{item.payer_name}</strong> · Split: {item.split_type}
                          </span>
                        </div>
                      </div>
                      <div className="expense-amount-info" onClick={(e) => e.stopPropagation()}>
                        <span className="expense-total" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          {formatCents(item.amount_cents, 'INR')}
                          {item.currency_code && item.currency_code !== 'INR' && (
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                              ({formatCents(item.amount_cents_original, item.currency_code)})
                            </span>
                          )}
                        </span>
                        <span className="expense-user-share">
                          You owe {formatSplitCents(item.splits, currentUser?.id, item.currency_code)}
                        </span>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px' }} onClick={() => openExpenseModal(item)}>
                            Edit
                          </button>
                          <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px' }} onClick={() => handleDeleteExpense(item.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Right Side: Members, Balances, and Active Chat */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Members list */}
          <div className="glass-panel">
            <div className="list-header" style={{ marginBottom: '14px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Group Balances</h3>
              <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setShowMemberModal(true)}>
                + Add
              </button>
            </div>
            
            <div className="list-items" style={{ gap: '10px' }}>
              {group?.members.map(member => {
                const bal = group.userSummaries[member.id]?.netBalanceCents || 0;
                return (
                  <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="avatar">{member.name.charAt(0).toUpperCase()}</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{member.name}</div>
                        {member.id !== currentUser?.id && bal === 0 && (
                          <button 
                            onClick={() => handleRemoveMember(member.id)} 
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <span className={bal > 0 ? 'bal-positive' : bal < 0 ? 'bal-negative' : 'bal-zero'}>
                      {bal > 0 ? `+${formatCents(bal)}` : bal < 0 ? `-${formatCents(bal)}` : 'settled'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Peer to peer group balances */}
            {group?.pairwiseBalances.length > 0 && (
              <div style={{ marginTop: '20px', borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '10px', letterSpacing: '0.5px' }}>
                  Pairwise Debts
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  {group.pairwiseBalances.map((pb, index) => {
                    const fromName = group.members.find(m => m.id === pb.fromUserId)?.name;
                    const toName = group.members.find(m => m.id === pb.toUserId)?.name;
                    return (
                      <div key={index} style={{ color: 'var(--text-secondary)' }}>
                        <strong>{fromName}</strong> owes <strong>{toName}</strong> {formatCents(pb.amountCents)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Chat Details Panel (If an expense is selected) */}
          {activeExpense && (
            <div className="glass-panel chat-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="chat-header">
                <div>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', fontWeight: 400 }}>
                    Discussing:
                  </span>
                  {activeExpense.description}
                </div>
                <button 
                  onClick={() => setActiveExpense(null)} 
                  style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  ✕
                </button>
              </div>

              {/* Chat splits info */}
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Paid by {activeExpense.payer_name}</span>
                {activeExpense.splits.map((s, idx) => {
                  const hasOriginal = s.amountOwedCentsOriginal !== undefined && s.amountOwedCentsOriginal !== s.amountOwedCents;
                  const origStr = hasOriginal ? ` (${formatCents(s.amountOwedCentsOriginal, activeExpense.currency_code)})` : '';
                  return (
                    <span key={idx}>· {s.userName}: {formatCents(s.amountOwedCents, 'INR')}{origStr}</span>
                  );
                })}
              </div>

              <div className="chat-messages">
                {messages.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', margin: 'auto' }}>
                    No messages yet. Send a note to the group about this expense!
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={`chat-bubble ${msg.userId === currentUser.id ? 'mine' : ''}`}>
                      <div className="bubble-meta">
                        <span className="bubble-user">{msg.userName}</span>
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="bubble-text">{msg.content}</div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendChatMessage} className="chat-form">
                <input
                  type="text"
                  className="form-input chat-input"
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  required
                />
                <button type="submit" className="btn btn-primary" style={{ padding: '10px 16px' }}>
                  Send
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Expense Modal */}
      {showExpenseModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h3 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '20px' }}>
              {editingExpenseId ? 'Edit Expense' : 'Add Expense'}
            </h3>
            
            {error && <div className="alert alert-danger">{error}</div>}

            <form onSubmit={handleSaveExpense}>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., Electricity bill, Dinner"
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Amount ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-input"
                    placeholder="0.00"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Who Paid?</label>
                  <select
                    className="form-input"
                    value={expensePayer}
                    onChange={(e) => setExpensePayer(e.target.value)}
                    required
                  >
                    {group.members.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Split Type</label>
                <select
                  className="form-input"
                  value={splitType}
                  onChange={(e) => { setSplitType(e.target.value); setError(''); }}
                  required
                >
                  <option value="equal">Split Equally</option>
                  <option value="unequal">Split Unequally (Exact amounts)</option>
                  <option value="percentage">Split by Percentages</option>
                  <option value="shares">Split by Shares</option>
                </select>
              </div>

              {/* Splits configuration area */}
              <div className="splits-config">
                <h4 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                  {splitType === 'equal' && 'Select who is included in the split:'}
                  {splitType === 'unequal' && 'Enter exact dollar amounts for each:'}
                  {splitType === 'percentage' && 'Enter percentage shares (must sum to 100%):'}
                  {splitType === 'shares' && 'Enter shares weight ratio for each:'}
                </h4>

                {group.members.map(m => {
                  const val = memberSplits[m.id] || { selected: true, value: '' };
                  return (
                    <div key={m.id} className="split-row">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={val.selected}
                          onChange={() => handleSplitCheckboxChange(m.id)}
                          disabled={splitType !== 'equal'} // For other types, force input values to dictate split inclusion
                        />
                        <span className="split-user">{m.name}</span>
                      </label>

                      {splitType !== 'equal' && val.selected && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {splitType === 'unequal' && <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>$</span>}
                          <input
                            type="number"
                            step={splitType === 'unequal' ? '0.01' : '0.1'}
                            min="0"
                            className="form-input split-input"
                            placeholder="0"
                            value={val.value}
                            onChange={(e) => handleSplitValueChange(m.id, e.target.value)}
                            required
                          />
                          {splitType === 'percentage' && <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>%</span>}
                          {splitType === 'shares' && <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>shares</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowExpenseModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle Up Modal */}
      {showSettleModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h3 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '20px' }}>Record a Payment</h3>
            {error && <div className="alert alert-danger">{error}</div>}

            <form onSubmit={handleSaveSettlement}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Who Paid?</label>
                  <select
                    className="form-input"
                    value={settlePayer}
                    onChange={(e) => setSettlePayer(e.target.value)}
                    required
                  >
                    {group.members.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Who Received?</label>
                  <select
                    className="form-input"
                    value={settleReceiver}
                    onChange={(e) => setSettleReceiver(e.target.value)}
                    required
                  >
                    {group.members.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Amount ($ USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input"
                  placeholder="0.00"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '28px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowSettleModal(false); setError(''); }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showMemberModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h3 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '20px' }}>Add Group Member</h3>
            {error && <div className="alert alert-danger">{error}</div>}

            <form onSubmit={handleAddMember}>
              <div className="form-group">
                <label className="form-label">Member's Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. peer@test.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  required
                />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>
                  The user must already have a registered account in Splitlet to be added.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '28px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowMemberModal(false); setError(''); }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

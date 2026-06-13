const db = require('../db');

/**
 * Computes pairwise balances for all members of a group.
 * Returns who owes whom and the net balances.
 *
 * @param {number} groupId - The ID of the group.
 * @returns {Promise<Object>} Balances object containing:
 *   - members: Array of group member user objects.
 *   - pairwiseBalances: List of individual pairwise debts: [{ fromUserId, toUserId, amountCents }]
 *     (where fromUserId owes toUserId amountCents).
 *   - userSummaries: Net balance summary for each user: { [userId]: { netBalanceCents, totalOwedCents, totalOwesCents } }
 */
async function getGroupBalances(groupId) {
  // 1. Get all members in the group
  const [members] = await db.query(
    `SELECT u.id, u.name, u.email 
     FROM users u 
     JOIN group_members gm ON u.id = gm.user_id 
     WHERE gm.group_id = ?`,
    [groupId]
  );

  const memberIds = members.map(m => m.id);
  const memberMap = {};
  members.forEach(m => { memberMap[m.id] = m; });

  // Initialize balance matrix: matrix[payer][debtor] = cents
  // matrix[A][B] = how much B owes A
  const matrix = {};
  memberIds.forEach(idA => {
    matrix[idA] = {};
    memberIds.forEach(idB => {
      matrix[idA][idB] = 0;
    });
  });

  // 2. Fetch all active expenses for the group
  const [expenses] = await db.query(
    `SELECT id, payer_id, amount_cents_inr AS amount_cents 
     FROM expenses 
     WHERE group_id = ? AND is_deleted = FALSE`,
    [groupId]
  );

  if (expenses.length > 0) {
    const expenseIds = expenses.map(e => e.id);
    
    // Fetch splits for these expenses
    const [splits] = await db.query(
      `SELECT expense_id, user_id, amount_owed_cents_inr AS amount_owed_cents 
       FROM splits 
       WHERE expense_id IN (?)`,
      [expenseIds]
    );

    // Group splits by expense_id
    const splitsByExpense = {};
    splits.forEach(s => {
      if (!splitsByExpense[s.expense_id]) {
        splitsByExpense[s.expense_id] = [];
      }
      splitsByExpense[s.expense_id].push(s);
    });

    // Process expenses & splits
    expenses.forEach(exp => {
      const payerId = exp.payer_id;
      const expSplits = splitsByExpense[exp.id] || [];

      expSplits.forEach(split => {
        const debtorId = split.user_id;
        // If debtor is in the group and is not the payer
        if (memberMap[debtorId] && memberMap[payerId] && debtorId !== payerId) {
          matrix[payerId][debtorId] += split.amount_owed_cents;
        }
      });
    });
  }

  // 3. Fetch all settlements for the group
  const [settlements] = await db.query(
    `SELECT payer_id, receiver_id, amount_cents_inr AS amount_cents 
     FROM settlements 
     WHERE group_id = ?`,
    [groupId]
  );

  // Process settlements (reduces debt)
  settlements.forEach(settle => {
    const payerId = settle.payer_id; // the person paying
    const receiverId = settle.receiver_id; // the person receiving
    if (memberMap[payerId] && memberMap[receiverId]) {
      // Payer paying receiver is equivalent to receiver owing payer less (or payer owing receiver less)
      // We represent: receiverId owes payerId 'amount_cents' as a credit
      matrix[receiverId][payerId] += settle.amount_cents;
    }
  });

  // 4. Calculate net pairwise balances
  // If A owes B $10 and B owes A $4, the net is A owes B $6.
  const pairwiseBalances = [];
  const userSummaries = {};
  
  memberIds.forEach(id => {
    userSummaries[id] = {
      netBalanceCents: 0,
      totalOwedCents: 0,
      totalOwesCents: 0
    };
  });

  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const idA = memberIds[i];
      const idB = memberIds[j];

      // How much B owes A (A is paid)
      const bOwesA = matrix[idA][idB];
      // How much A owes B (B is paid)
      const aOwesB = matrix[idB][idA];

      const net = bOwesA - aOwesB;

      if (net > 0) {
        // B owes A
        pairwiseBalances.push({
          fromUserId: idB,
          toUserId: idA,
          amountCents: net
        });
        userSummaries[idA].netBalanceCents += net;
        userSummaries[idA].totalOwedCents += net;
        userSummaries[idB].netBalanceCents -= net;
        userSummaries[idB].totalOwesCents += net;
      } else if (net < 0) {
        // A owes B
        const absNet = Math.abs(net);
        pairwiseBalances.push({
          fromUserId: idA,
          toUserId: idB,
          amountCents: absNet
        });
        userSummaries[idB].netBalanceCents += absNet;
        userSummaries[idB].totalOwedCents += absNet;
        userSummaries[idA].netBalanceCents -= absNet;
        userSummaries[idA].totalOwesCents += absNet;
      }
    }
  }

  return {
    members,
    pairwiseBalances,
    userSummaries
  };
}

/**
 * Computes global balances for a user across all groups they belong to.
 *
 * @param {number} userId - The ID of the user.
 * @returns {Promise<Object>} Global balance summary:
 *   - netBalanceCents: Overall net balance.
 *   - totalOwedCents: Total amount user is owed.
 *   - totalOwesCents: Total amount user owes.
 *   - groupBalances: List of group-level summaries.
 *   - pairwiseBalancesCombined: Pairwise balances across all groups aggregated by person.
 */
async function getUserGlobalBalances(userId) {
  // 1. Get all groups this user is in
  const [groups] = await db.query(
    `SELECT g.id, g.name 
     FROM \`groups\` g 
     JOIN group_members gm ON g.id = gm.group_id 
     WHERE gm.user_id = ?`,
    [userId]
  );

  let netBalanceCents = 0;
  let totalOwedCents = 0;
  let totalOwesCents = 0;
  const groupBalances = [];
  
  // Aggregate peer-to-peer balances globally
  // Map key: peerUserId -> balance (positive means peer owes user, negative means user owes peer)
  const peerBalances = {};
  const peerNames = {};

  for (const group of groups) {
    const groupResult = await getGroupBalances(group.id);
    const summary = groupResult.userSummaries[userId] || { netBalanceCents: 0, totalOwedCents: 0, totalOwesCents: 0 };
    
    groupBalances.push({
      groupId: group.id,
      groupName: group.name,
      userSummary: summary
    });

    netBalanceCents += summary.netBalanceCents;
    totalOwedCents += summary.totalOwedCents;
    totalOwesCents += summary.totalOwesCents;

    // Aggregate pairwise
    groupResult.pairwiseBalances.forEach(pb => {
      // Find peer
      let peerId;
      let direction; // 'owed' or 'owes'
      if (pb.fromUserId === userId) {
        peerId = pb.toUserId;
        direction = 'owes'; // user owes peer
      } else if (pb.toUserId === userId) {
        peerId = pb.fromUserId;
        direction = 'owed'; // peer owes user
      } else {
        return; // not involving this user
      }

      const peerUser = groupResult.members.find(m => m.id === peerId);
      if (peerUser) {
        peerNames[peerId] = peerUser.name;
      }

      if (!peerBalances[peerId]) {
        peerBalances[peerId] = 0;
      }

      if (direction === 'owed') {
        peerBalances[peerId] += pb.amountCents;
      } else {
        peerBalances[peerId] -= pb.amountCents;
      }
    });
  }

  const pairwiseBalancesCombined = [];
  Object.keys(peerBalances).forEach(peerIdStr => {
    const peerId = parseInt(peerIdStr, 10);
    const net = peerBalances[peerId];
    if (net > 0) {
      pairwiseBalancesCombined.push({
        peerId,
        peerName: peerNames[peerId] || `User ${peerId}`,
        status: 'owed',
        amountCents: net
      });
    } else if (net < 0) {
      pairwiseBalancesCombined.push({
        peerId,
        peerName: peerNames[peerId] || `User ${peerId}`,
        status: 'owes',
        amountCents: Math.abs(net)
      });
    }
  });

  return {
    netBalanceCents,
    totalOwedCents,
    totalOwesCents,
    groupBalances,
    pairwiseBalancesCombined
  };
}

module.exports = {
  getGroupBalances,
  getUserGlobalBalances
};

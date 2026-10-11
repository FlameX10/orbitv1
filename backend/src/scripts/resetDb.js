const prisma = require('../config/prisma');
const agentService = require('../services/agent.service');
const logger = require('../config/logger');

async function resetDatabase() {
  console.log('Starting database wipe (clearing all entries while preserving schema)...');

  try {
    // Delete dependent records first to maintain relational integrity
    const deleteMessages = await prisma.conversationMessage.deleteMany({});
    console.log(`Deleted ${deleteMessages.count} ConversationMessage entries.`);

    const deleteQualResults = await prisma.qualificationResult.deleteMany({});
    console.log(`Deleted ${deleteQualResults.count} QualificationResult entries.`);

    const deleteCallbacks = await prisma.callback.deleteMany({});
    console.log(`Deleted ${deleteCallbacks.count} Callback entries.`);

    const deleteCallAttempts = await prisma.callAttempt.deleteMany({});
    console.log(`Deleted ${deleteCallAttempts.count} CallAttempt entries.`);

    const deleteWebhookEvents = await prisma.webhookEvent.deleteMany({});
    console.log(`Deleted ${deleteWebhookEvents.count} WebhookEvent entries.`);

    const deleteLeads = await prisma.lead.deleteMany({});
    console.log(`Deleted ${deleteLeads.count} Lead entries.`);

    const deleteCampaigns = await prisma.campaign.deleteMany({});
    console.log(`Deleted ${deleteCampaigns.count} Campaign entries.`);

    const deleteAgents = await prisma.agentConfig.deleteMany({});
    console.log(`Deleted ${deleteAgents.count} AgentConfig entries.`);

    const deleteUsers = await prisma.user.deleteMany({});
    console.log(`Deleted ${deleteUsers.count} User entries.`);

    // Safe development-only clear of pending/archived pg-boss queue jobs for application queues
    if (process.env.NODE_ENV !== 'production') {
      try {
        const clearedJobs = await prisma.$executeRawUnsafe(`
          DELETE FROM pgboss.job 
          WHERE name IN ('call-lead-queue', 'callback-lead-queue', 'post-call-processing-queue')
        `);
        console.log(`Cleared ${clearedJobs} pending pg-boss queue jobs.`);

        const clearedArchive = await prisma.$executeRawUnsafe(`
          DELETE FROM pgboss.archive 
          WHERE name IN ('call-lead-queue', 'callback-lead-queue', 'post-call-processing-queue')
        `);
        console.log(`Cleared ${clearedArchive} archived pg-boss queue jobs.`);
      } catch (pgBossErr) {
        console.log(`Note: pg-boss queue table clear skipped (${pgBossErr.message})`);
      }
    }

    console.log('\nRe-initializing default AgentConfig...');
    const defaultAgent = await agentService.getOrCreateDefaultAgent();
    console.log(`Default AgentConfig created with ID [${defaultAgent.id}].`);

    console.log('\nDatabase successfully cleared and ready for new calls with 0 lead/call entries!');
  } catch (err) {
    console.error('Failed to reset database:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetDatabase();

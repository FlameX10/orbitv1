const prisma = require('../config/prisma');
const logger = require('../config/logger');
const llmService = require('../integrations/llm/llm.service');
const agentService = require('./agent.service');
const schedulingService = require('./scheduling.service');

class QualificationService {
  /**
   * Process a human speech turn during a live call or webhook turn
   */
  async processHumanMessage({ callAttemptId, humanMessage }) {
    // 1. Fetch CallAttempt with lead & previous messages
    const callAttempt = await prisma.callAttempt.findUnique({
      where: { id: callAttemptId },
      include: {
        lead: true,
        messages: { orderBy: { timestamp: 'asc' } }
      }
    });

    if (!callAttempt) {
      throw new Error(`Call attempt [${callAttemptId}] not found.`);
    }

    // 2. Log Human turn in isolated conversation history
    await prisma.conversationMessage.create({
      data: {
        callAttemptId: callAttempt.id,
        role: 'HUMAN',
        content: humanMessage
      }
    });

    // 3. Rule 1 Check: If lead is DO_NOT_CALL, stop
    if (callAttempt.lead.status === 'DO_NOT_CALL') {
      logger.warn(`Rule 1 Enforced: Lead [${callAttempt.leadId}] is DO_NOT_CALL.`);
      return {
        aiResponse: "I understand. I have updated our system to ensure we do not call you again. Have a great day.",
        intent: 'DO_NOT_CALL',
        action: 'END_CALL_DNC'
      };
    }

    // 4. Build concise context from previous conversation
    const previousContext = callAttempt.messages
      .slice(-6)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    // 5. Use LLM Service to classify intent and extract structured response
    const llmResult = await llmService.classifyAndExtract(humanMessage, previousContext);
    logger.info(`LLM Classification Result for Call [${callAttemptId}]`, { intent: llmResult.intent, callbackRequested: llmResult.callback?.requested });

    // 6. Handle Intent Business Logic (Rule 7 & Rule 8: Backend controls state changes)
    if (llmResult.doNotCall || llmResult.intent === 'DO_NOT_CALL') {
      // Mark lead DO_NOT_CALL (Rule 1)
      await prisma.lead.update({
        where: { id: callAttempt.leadId },
        data: { status: 'DO_NOT_CALL' }
      });

      const aiText = "Understood. I will immediately mark your number so we do not call you again. Thank you.";
      await prisma.conversationMessage.create({
        data: { callAttemptId: callAttempt.id, role: 'AI', content: aiText }
      });

      return { aiResponse: aiText, intent: 'DO_NOT_CALL', action: 'END_CALL_DNC' };
    }

    if (llmResult.callback?.requested || llmResult.intent === 'CALLBACK_REQUEST') {
      // Resolve Callback Date/Time using Scheduling Service
      const rawTimeText = llmResult.callback?.rawText || humanMessage;
      const scheduledFor = schedulingService.resolveCallbackTime(rawTimeText);

      await schedulingService.scheduleCallback({
        leadId: callAttempt.leadId,
        callAttemptId: callAttempt.id,
        scheduledFor,
        reason: `Requested callback during call: "${humanMessage}"`
      });

      const aiText = llmResult.response || `Sure thing! I have scheduled a callback for you. Talk to you then!`;
      await prisma.conversationMessage.create({
        data: { callAttemptId: callAttempt.id, role: 'AI', content: aiText }
      });

      return { aiResponse: aiText, intent: 'CALLBACK_REQUEST', action: 'SCHEDULE_CALLBACK' };
    }

    // Log AI response turn
    const aiText = llmResult.response || "Thank you for that detail. Could you tell me more about your timeline?";
    await prisma.conversationMessage.create({
      data: { callAttemptId: callAttempt.id, role: 'AI', content: aiText }
    });

    return { aiResponse: aiText, intent: llmResult.intent || 'ANSWER', action: 'CONTINUE' };
  }

  /**
   * Run post-call evaluation to compute BANT score, summary & final qualification disposition
   */
  async processPostCallQualification(callAttemptId) {
    const callAttempt = await prisma.callAttempt.findUnique({
      where: { id: callAttemptId },
      include: {
        lead: true,
        messages: { orderBy: { timestamp: 'asc' } },
        agent: true
      }
    });

    if (!callAttempt || callAttempt.messages.length === 0) {
      logger.info(`No transcript messages found for call attempt [${callAttemptId}]. Skipping post-call qualification.`);
      return null;
    }

    const agentConfig = callAttempt.agent || await agentService.getOrCreateDefaultAgent();
    const evaluation = await llmService.generatePostCallSummary(callAttempt.messages, agentConfig);

    const totalScore = evaluation.scores?.totalScore || 50;
    const isQualified = totalScore >= agentConfig.qualificationThreshold;
    const finalDisposition = isQualified ? 'QUALIFIED' : (evaluation.disposition || 'NOT_QUALIFIED');

    // Create or update QualificationResult record
    const result = await prisma.qualificationResult.upsert({
      where: { leadId: callAttempt.leadId },
      update: {
        callAttemptId: callAttempt.id,
        result: finalDisposition,
        score: totalScore,
        budget: evaluation.budget,
        need: evaluation.need,
        authority: evaluation.authority,
        timeline: evaluation.timeline,
        summary: evaluation.summary,
        rawOutput: evaluation
      },
      create: {
        leadId: callAttempt.leadId,
        callAttemptId: callAttempt.id,
        result: finalDisposition,
        score: totalScore,
        budget: evaluation.budget,
        need: evaluation.need,
        authority: evaluation.authority,
        timeline: evaluation.timeline,
        summary: evaluation.summary,
        rawOutput: evaluation
      }
    });

    // Update Lead status and qualification score
    await prisma.lead.update({
      where: { id: callAttempt.leadId },
      data: {
        status: isQualified ? 'QUALIFIED' : 'NOT_QUALIFIED',
        qualificationScore: totalScore
      }
    });

    // Update call attempt summary
    await prisma.callAttempt.update({
      where: { id: callAttempt.id },
      data: { summary: evaluation.summary }
    });

    logger.info(`Post-call Qualification completed for Lead [${callAttempt.leadId}]: Score [${totalScore}] -> Status [${finalDisposition}]`);
    return result;
  }
}

module.exports = new QualificationService();

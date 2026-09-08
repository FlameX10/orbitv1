const prisma = require('../config/prisma');
const logger = require('../config/logger');

const DEFAULT_QUESTIONS = [
  { id: 'q1', dimension: 'need', question: 'What type of software or application are you looking to build?', required: true },
  { id: 'q2', dimension: 'need', question: 'What specific business problem are you trying to solve with this project?', required: true },
  { id: 'q3', dimension: 'budget', question: 'What is your allocated budget range for this software project?', required: true },
  { id: 'q4', dimension: 'timeline', question: 'When are you looking to kick off development?', required: true },
  { id: 'q5', dimension: 'authority', question: 'Are you the primary decision maker for technology vendors?', required: true }
];

const DEFAULT_SCORING = {
  need: 25,
  budget: 25,
  authority: 20,
  timeline: 20,
  fit: 10
};

class AgentService {
  async getOrCreateDefaultAgent() {
    let agent = await prisma.agentConfig.findFirst({
      orderBy: { createdAt: 'asc' }
    });

    if (!agent) {
      agent = await prisma.agentConfig.create({
        data: {
          name: 'Vedron Sales Qualification AI',
          companyName: 'Vedron Dev Co',
          voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel
          language: 'en-US',
          systemPrompt: `You are an intelligent, professional, consultative sales qualification agent representing Vedron Dev Co.
Your goal is to qualify inbound website leads by asking BANT (Budget, Authority, Need, Timeline) questions naturally.
Be concise, polite, natural, confident, and non-pushy. If the customer answers a future question early, do not repeat it.`,
          openingMessage: "Hi, this is Jordan calling from Vedron Dev Co regarding your software project inquiry. Is now a good time to speak briefly?",
          closingMessage: "Thank you for sharing your project details. Our technical team will review this and follow up shortly!",
          qualificationQuestions: DEFAULT_QUESTIONS,
          scoringRules: DEFAULT_SCORING,
          qualificationThreshold: 60,
          maxCallDuration: 600,
          maxAttempts: 3
        }
      });
      logger.info('Created default AgentConfig record in database');
    }

    return agent;
  }

  async getAgentById(id) {
    if (!id) return this.getOrCreateDefaultAgent();
    const agent = await prisma.agentConfig.findUnique({ where: { id } });
    return agent || this.getOrCreateDefaultAgent();
  }

  async updateAgent(id, updateData) {
    return await prisma.agentConfig.update({
      where: { id },
      data: updateData
    });
  }

  async listAgents() {
    await this.getOrCreateDefaultAgent();
    return await prisma.agentConfig.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }
}

module.exports = new AgentService();

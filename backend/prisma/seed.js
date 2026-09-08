const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial system data...');

  // 1. Create Admin User
  const passwordHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@vedron.dev' },
    update: {},
    create: {
      email: 'admin@vedron.dev',
      name: 'Sales Manager Admin',
      passwordHash,
      role: 'ADMIN'
    }
  });
  console.log('Admin user seeded:', admin.email);

  // 2. Create Default Agent Config
  const agent = await prisma.agentConfig.create({
    data: {
      name: 'Jordan - Senior Sales Qualification Agent',
      companyName: 'Vedron Dev Co',
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      language: 'en-US',
      systemPrompt: 'You are an intelligent, consultative sales qualification agent representing Vedron Dev Co.',
      openingMessage: 'Hi, this is Jordan calling from Vedron Dev Co regarding your software project inquiry. Is now a good time to speak briefly?',
      closingMessage: 'Thank you for sharing your project details. Our technical team will review this and follow up shortly!',
      qualificationQuestions: [
        { id: 'q1', dimension: 'need', question: 'What software or mobile app are you looking to build?', required: true },
        { id: 'q2', dimension: 'budget', question: 'What is your allocated budget range?', required: true },
        { id: 'q3', dimension: 'timeline', question: 'When are you looking to start development?', required: true },
        { id: 'q4', dimension: 'authority', question: 'Are you the primary decision maker?', required: true }
      ],
      scoringRules: { need: 25, budget: 25, authority: 20, timeline: 20, fit: 10 },
      qualificationThreshold: 60,
      maxCallDuration: 600,
      maxAttempts: 3
    }
  });
  console.log('Agent Config seeded:', agent.name);

  // 3. Create Sample Leads
  const leadsData = [
    {
      firstName: 'Rahul',
      lastName: 'Sharma',
      phone: '+919876543210',
      email: 'rahul@example.com',
      company: 'ABC Logistics Pvt Ltd',
      source: 'website',
      status: 'QUALIFIED',
      qualificationScore: 85
    },
    {
      firstName: 'Priya',
      lastName: 'Patel',
      phone: '+919876543211',
      email: 'priya@techventures.io',
      company: 'TechVentures',
      source: 'landing_page',
      status: 'CALLBACK_SCHEDULED',
      qualificationScore: 70
    },
    {
      firstName: 'Michael',
      lastName: 'Scott',
      phone: '+15005550001',
      email: 'mscott@dundermifflin.com',
      company: 'Dunder Mifflin',
      source: 'demo_form',
      status: 'NEW',
      qualificationScore: 0
    }
  ];

  for (const l of leadsData) {
    await prisma.lead.upsert({
      where: { phone: l.phone },
      update: {},
      create: l
    });
  }

  console.log('Sample leads seeded successfully.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

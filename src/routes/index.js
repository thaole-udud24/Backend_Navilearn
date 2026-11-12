const express = require('express');
const authRoutes = require('../modules/account/account.auth.routes');
const templateRoutes = require('../modules/_template/_template.routes');
const accountRoutes = require('../modules/account/account.routes');
const assessmentConfigRoutes = require('../modules/assessment-config/assessment-config.routes');
const adaptiveRoutes = require('../modules/adaptive/adaptive.routes');
const aiAssistRoutes = require('../modules/ai-assist/ai-assist.routes');
const aiConfigRoutes = require('../modules/ai-config/ai-config.routes');
const adminReportRoutes = require('../modules/admin-report/admin-report.routes');
const assessmentRoutes = require('../modules/assessment/assessment.routes');
const businessRuleRoutes = require('../modules/business-rule/business-rule.routes');
const dataRetentionRoutes = require('../modules/data-retention/data-retention.routes');
const knowledgeRoutes = require('../modules/knowledge/knowledge.routes');
const monitoringRoutes = require('../modules/monitoring/monitoring.routes');
const masteryRoutes = require('../modules/mastery/mastery.routes');
const notificationRoutes = require('../modules/notification/notification.routes');
const planningRoutes = require('../modules/planning/planning.routes');
const questionBankRoutes = require('../modules/question-bank/question-bank.routes');
const rbacRoutes = require('../modules/account/account.rbac.routes');
const reviewRoutes = require('../modules/review/review.routes');
const reportRoutes = require('../modules/report/report.routes');
const riskRoutes = require('../modules/risk/risk.routes');
const subjectRoutes = require('../modules/subject/subject.routes');
const supportRoutes = require('../modules/support/support.routes');

const router = express.Router();

router.get('/health', (req, res) => res.status(200).json({ success: true, data: { status: 'ok' }, message: 'OK' }));

router.use('/auth', authRoutes);
// TEMPLATE module mounted for demo; real modules register their router here the same way.
router.use('/template-items', templateRoutes);
router.use('/account-items', accountRoutes);
router.use('/assessment-config-items', assessmentConfigRoutes);
router.use('/adaptive-items', adaptiveRoutes);
router.use('/ai-assist-items', aiAssistRoutes);
router.use('/ai-config-items', aiConfigRoutes);
router.use('/admin-report-items', adminReportRoutes);
router.use('/assessment-items', assessmentRoutes);
router.use('/business-rule-items', businessRuleRoutes);
router.use('/data-retention-items', dataRetentionRoutes);
router.use('/knowledge-items', knowledgeRoutes);
router.use('/monitoring-items', monitoringRoutes);
router.use('/mastery-items', masteryRoutes);
router.use('/notification-items', notificationRoutes);
router.use('/planning-items', planningRoutes);
router.use('/question-bank-items', questionBankRoutes);
router.use('/rbac-items', rbacRoutes);
router.use('/review-items', reviewRoutes);
router.use('/report-items', reportRoutes);
router.use('/risk-items', riskRoutes);
router.use('/subject-items', subjectRoutes);
router.use('/support-items', supportRoutes);

module.exports = router;

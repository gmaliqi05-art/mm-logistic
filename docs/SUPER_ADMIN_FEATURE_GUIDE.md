# Super Admin - Manual Feature Activation Guide

**Quick Reference për Manual Feature Override System**

---

## 🎯 OVERVIEW

Si Super Admin, ju keni mundësinë të aktivizoni ose çaktivizoni manualisht features premium për çdo kompani, duke anashkaluar subscription plan restrictions.

### Kur ta përdorni:
- ✅ Free trials të zgjatuara
- ✅ Partnership deals
- ✅ Special customer requests
- ✅ Beta testing të features të reja
- ✅ Promotional offers
- ✅ Emergency access për support

---

## 📋 FEATURES TË DISPONUESHME

| Feature | Përshkrimi | Default Plan |
|---------|-----------|--------------|
| **documents_signing** | Digital document signing | Standard+ |
| **basic_reports** | Basic reporting and analytics | Standard+ |
| **categories** | Product category management | Standard+ |
| **advanced_reports** | Detailed analytics & custom reports | Premium |
| **export_pdf** | Export data as PDF | Premium |
| **export_excel** | Export to Excel spreadsheets | Premium |
| **audit_log** | Track all changes and actions | Premium |
| **bulk_operations** | Bulk actions on multiple items | Premium |
| **stock_alerts** | Low stock notifications | Premium |
| **data_export** | Full data export capability | Premium |

---

## 🚀 QUICK START

### Step 1: Navigate to Companies
1. Login si Super Admin
2. Click **"Companies"** në sidebar
3. Shiko listën e gjitha companies

### Step 2: Open Feature Manager
1. Find target company në list
2. Click **Settings icon (⚙️)** në Actions column
3. Modal hapet me feature list

### Step 3: Manage Features
1. **Enable Feature:**
   - Click "Enable" button pranë feature
   - Add notes (optional but recommended)
   - Changes save automatically

2. **Disable Feature:**
   - Click "Disable" button për active feature
   - Confirm action

3. **Remove Override:**
   - Click trash icon (🗑️)
   - Feature reverts to plan-based access

---

## 💡 USE CASE EXAMPLES

### Example 1: Extended Trial
```
Scenario: Company ABC wants to test premium features
Company: ABC Corporation
Current Plan: Free Trial (expired 5 days ago)
Action: Enable "advanced_reports" + "export_pdf"
Notes: "Extended trial for evaluation - expires 2026-03-07"
Result: Company can use premium features temporarily
```

### Example 2: Partnership Deal
```
Scenario: Strategic partner needs full access
Company: Partner XYZ Ltd
Current Plan: Standard
Action: Enable ALL premium features
Notes: "Partnership agreement - full premium access included"
Result: Partner gets all premium features without upgrade
```

### Example 3: Emergency Support
```
Scenario: Customer needs audit logs for compliance
Company: Important Client Inc
Current Plan: Standard
Action: Enable "audit_log" only
Notes: "Compliance audit requirement - temporary access"
Result: Client can generate audit reports
```

### Example 4: Beta Testing
```
Scenario: Testing new feature with select customers
Company: Beta Tester Corp
Current Plan: Any
Action: Enable "new_feature" (when available)
Notes: "Beta tester for new bulk operations feature"
Result: Customer tests feature before general release
```

---

## ⚠️ BEST PRACTICES

### DO ✅

1. **Always Add Notes**
   - Explain why override është aktivizuar
   - Include expiration date nëse temporary
   - Reference ticket/deal number

2. **Regular Review**
   - Review manual overrides monthly
   - Remove expired/unnecessary overrides
   - Keep database clean

3. **Communication**
   - Inform customer për manual activation
   - Set expectations për temporary access
   - Document në CRM/support system

4. **Audit Trail**
   - Check who enabled features
   - Review reasons periodically
   - Monitor for abuse

### DON'T ❌

1. **Don't Forget to Document**
   - Empty notes make tracking hard
   - Future you will thank present you

2. **Don't Enable Everything**
   - Only enable needed features
   - Consider security implications
   - Maintain business model integrity

3. **Don't Leave Orphaned Overrides**
   - Remove when deal expires
   - Clean up after trials end
   - Archive when company inactive

4. **Don't Override Without Reason**
   - Always have business justification
   - Get approval for major overrides
   - Follow company policies

---

## 🔍 HOW IT WORKS

### Priority System

```
Feature Access Check Priority:

1. SUPER ADMIN ──────────► ALWAYS GRANTED ✅
                            (you bypass everything)

2. MANUAL OVERRIDE ──────► CHECK DATABASE
   └─ Enabled? ──────────► ACCESS GRANTED ✅
   └─ Disabled? ─────────► ACCESS DENIED ❌
   └─ Not Set? ──────────► Go to step 3

3. SUBSCRIPTION PLAN ────► CHECK PLAN FEATURES
   └─ In plan? ──────────► ACCESS GRANTED ✅
   └─ Not in plan? ──────► ACCESS DENIED ❌

4. EXPIRED SUBSCRIPTION ─► ACCESS DENIED ❌
                            (except manual overrides)
```

### Example Scenarios

**Scenario A: Standard Plan with Override**
- Plan: Standard (has basic_reports)
- Override: advanced_reports = ENABLED
- Result: Has BOTH basic AND advanced reports

**Scenario B: Expired Trial with Override**
- Plan: Free Trial (EXPIRED)
- Override: export_pdf = ENABLED
- Result: ONLY export_pdf works (plan features blocked)

**Scenario C: Premium Plan with Disabled Override**
- Plan: Premium (has all features)
- Override: audit_log = DISABLED
- Result: audit_log BLOCKED (override wins)

---

## 📊 MONITORING & ANALYTICS

### View Current Overrides

Per Company:
1. Open Companies page
2. Click Settings icon (⚙️)
3. See all enabled manual features
4. Check who enabled and when

### Audit Trail

Each override tracks:
- **Company:** Which company
- **Feature:** What feature
- **Status:** Enabled/Disabled
- **Enabled By:** Which super admin
- **Enabled At:** Timestamp
- **Notes:** Justification/reason

### Reports (Future)

Coming soon:
- [ ] Most overridden features
- [ ] Companies with most overrides
- [ ] Override duration analytics
- [ ] Revenue impact analysis

---

## 🆘 TROUBLESHOOTING

### Feature Not Working After Enable

**Problem:** Enabled feature but company still can't access

**Solutions:**
1. Check subscription not expired (manual overrides work even if expired)
2. Verify RLS policies në database
3. Check browser console për errors
4. Ask company to refresh page (Ctrl+F5)
5. Verify correct company selected

### Can't Enable Feature

**Problem:** Enable button nuk funksionon

**Solutions:**
1. Verify you're logged in as Super Admin
2. Check network connection
3. Check browser console për errors
4. Try refreshing page
5. Check database RLS policies

### Override Not Showing

**Problem:** Manual override not visible në feature manager

**Solutions:**
1. Check database për existing record
2. Verify company_id correct
3. Refresh page
4. Check is_enabled field në database

---

## 🔐 SECURITY NOTES

### Access Control

- ✅ Only Super Admins can manage features
- ✅ Company Admins can VIEW their overrides (read-only)
- ✅ Depot Workers/Drivers cannot see overrides
- ✅ All changes logged në database

### Database Security

- ✅ Row Level Security (RLS) enabled
- ✅ Safe functions për company_id lookup
- ✅ Foreign key constraints
- ✅ Audit trail immutable

### Best Security Practices

1. Don't share super admin credentials
2. Review manual overrides regularly
3. Remove unnecessary access promptly
4. Document all changes
5. Follow principle of least privilege

---

## 📞 SUPPORT

### Need Help?

**Database Issues:**
- Check Supabase logs
- Verify migrations applied
- Test RLS policies

**UI Issues:**
- Check browser console
- Clear cache (Ctrl+Shift+Delete)
- Try different browser

**Business Questions:**
- Consult pricing strategy
- Review partnership agreements
- Check with sales team

---

## 🎓 TRAINING RESOURCES

### Video Tutorials
*(Coming Soon)*
- [ ] Introduction to Manual Features
- [ ] Common Use Cases
- [ ] Troubleshooting Guide

### Documentation
- ✅ This guide (quick reference)
- ✅ COMPREHENSIVE_AUDIT_REPORT.md (technical details)
- ✅ Database schema documentation

### Practice Environment
- Test account: Create test companies
- Sandbox mode: Try features safely
- Demo data: Pre-populated scenarios

---

## 📝 CHANGELOG

### Version 1.0.0 (2026-02-07)
- ✅ Initial release
- ✅ 10 features available for override
- ✅ Full CRUD operations
- ✅ Audit trail implementation
- ✅ Security policies enabled
- ✅ UI component completed

### Upcoming (Version 1.1.0)
- [ ] Bulk enable/disable
- [ ] Feature expiration dates
- [ ] Email notifications
- [ ] Usage analytics dashboard

---

## ✅ QUICK CHECKLIST

Before enabling manual features:

- [ ] Verified business justification
- [ ] Checked customer's current plan
- [ ] Prepared notes/documentation
- [ ] Communicated with customer
- [ ] Set reminder për review/removal (if temporary)
- [ ] Documented në CRM/ticketing system

After enabling:

- [ ] Verified feature works për customer
- [ ] Confirmed customer notified
- [ ] Added calendar reminder për review
- [ ] Updated customer record
- [ ] Logged në company notes

---

**Last Updated:** 2026-02-07
**Version:** 1.0.0
**Status:** Production Ready ✅

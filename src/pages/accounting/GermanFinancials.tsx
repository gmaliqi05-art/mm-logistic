import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2,
  Calendar,
  Download,
  Printer,
  Scale,
  Calculator,
  ListOrdered,
  Receipt,
  Briefcase,
  FileText,
  Globe,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useCompliance } from '../../hooks/useCompliance';
import {
  vatStandardRate,
  vatReducedRate,
  currency as currencyRule,
  chartOfAccounts as coaRule,
  taxAuthority,
  isCountry,
} from '../../lib/complianceEngine';

type TabKey = 'bilanz' | 'guv' | 'trial_balance' | 'vat' | 'cash_basis' | 'afa';

interface CoARow {
  account_code: string;
  name: string;
  account_type: string;
  account_group: string;
  vat_rate: number;
}

interface BalanceRow {
  code: string;
  name: string;
  group: string;
  debit: number;
  credit: number;
  balance: number;
}

interface CountryLabels {
  pageTitle: string;
  pageSubtitle: string;
  bilanz: { label: string; desc: string };
  guv: { label: string; desc: string };
  trial: { label: string; desc: string };
  vat: { label: string; desc: string; payableLabel: string };
  cashBasis: { label: string; desc: string; note: string } | null;
  afa: { label: string; desc: string };
  assetsHeading: string;
  liabilitiesHeading: string;
  totalAssets: string;
  totalLiabilities: string;
  income: string;
  expenses: string;
  result: string;
  totalIncome: string;
  totalExpenses: string;
}

const fallbackLabels: CountryLabels = {
  pageTitle: 'Raportet Financiare',
  pageSubtitle: 'Bilanci, Fitim-Humbja, TVSH dhe Amortizimi',
  bilanz: { label: 'Bilanci', desc: 'Pasqyra e gjendjes - Aktiva kundrejt Pasivave' },
  guv: { label: 'Fitim-Humbja', desc: 'Pasqyra e te ardhurave dhe shpenzimeve' },
  trial: { label: 'Lista Saldo', desc: 'Saldo e secilit llogari ne fund te periudhes' },
  vat: { label: 'Deklarata e TVSH-se', desc: 'Periudha e tatimit mbi vleren e shtuar', payableLabel: 'TVSH per pagese' },
  cashBasis: null,
  afa: { label: 'Amortizimi', desc: 'Plan amortizimi per asetet fikse' },
  assetsHeading: 'AKTIVA',
  liabilitiesHeading: 'PASIVA',
  totalAssets: 'Totali Aktiva',
  totalLiabilities: 'Totali Pasiva',
  income: 'Te ardhurat',
  expenses: 'Shpenzimet',
  result: 'Rezultati',
  totalIncome: 'Totali te ardhura',
  totalExpenses: 'Totali shpenzime',
};

function labelsForCountry(countryCode: string | null): CountryLabels {
  switch (countryCode) {
    case 'DE':
      return {
        ...fallbackLabels,
        pageTitle: 'Raportet Financiare Gjermane',
        pageSubtitle: 'Bilanz, GuV, UStVA, EUR dhe AfA sipas standardit SKR03',
        bilanz: { label: 'Bilanci (Bilanz)', desc: 'Pasqyra e gjendjes - Aktiva kundrejt Pasivave' },
        guv: { label: 'Fitim-Humbja (GuV)', desc: 'Pasqyra e te ardhurave sipas Gesamtkostenverfahren' },
        trial: { label: 'Lista Summen-Salden', desc: 'Saldo e secilit llogari ne fund te periudhes' },
        vat: { label: 'UStVA (TVSH)', desc: 'Deklarata periodike e TVSH-se per Finanzamt', payableLabel: 'Zahllast / Vorsteueruberhang' },
        cashBasis: {
          label: 'EUR',
          desc: 'Einnahmen-Ueberschuss-Rechnung per biznese te vogla',
          note: 'EUR perdoret per biznese te vogla me xhiro nen 800.000 EUR dhe fitim nen 80.000 EUR (§141 AO). Bazohet ne principin Zuflussprinzip - vetem transaksionet e paguara.',
        },
        afa: { label: 'AfA (Amortizimi)', desc: 'Plan amortizimi per asetet fikse' },
        result: 'Rezultati (Jahresueberschuss/-fehlbetrag)',
      };
    case 'XK':
      return {
        ...fallbackLabels,
        pageTitle: 'Raportet Financiare - Kosova',
        pageSubtitle: 'Bilanci, Fitim-Humbja, TVSH dhe Amortizimi sipas ATK',
        vat: {
          label: 'Deklarata e TVSH-se (ATK)',
          desc: 'Deklarata mujore per Administraten Tatimore te Kosoves',
          payableLabel: 'TVSH per pagese',
        },
        cashBasis: {
          label: 'Tatimi i Thjeshtuar',
          desc: 'Per biznese me xhiro nen 50.000 EUR (Skema e Thjeshtuar)',
          note: 'Skema e thjeshtuar bazohet vetem ne transaksionet e paguara dhe perdoret nga biznese me xhiro vjetore deri ne 50.000 EUR.',
        },
      };
    case 'AL':
      return {
        ...fallbackLabels,
        pageTitle: 'Raportet Financiare - Shqiperia',
        pageSubtitle: 'Pasqyrat financiare sipas Planit Kombetar te Llogarive',
        vat: {
          label: 'Deklarata e TVSH-se',
          desc: 'Deklarata mujore per Drejtorine e Pergjithshme te Tatimeve',
          payableLabel: 'TVSH per pagese',
        },
      };
    case 'CH':
      return {
        ...fallbackLabels,
        pageTitle: 'Finanzberichte - Schweiz',
        pageSubtitle: 'Bilanz, Erfolgsrechnung, MWST nach Swiss KMU Kontenplan',
        bilanz: { label: 'Bilanz', desc: 'Aktiven gegen Passiven' },
        guv: { label: 'Erfolgsrechnung', desc: 'Ertrag und Aufwand der Periode' },
        vat: { label: 'MWST', desc: 'MWST-Abrechnung fuer ESTV', payableLabel: 'MWST-Schuld' },
        afa: { label: 'Abschreibungen', desc: 'Abschreibungsplan fuer Anlagevermoegen' },
      };
    case 'AT':
      return {
        ...fallbackLabels,
        pageTitle: 'Finanzberichte - Osterreich',
        pageSubtitle: 'Bilanz, GuV, USt nach Einheitskontenrahmen',
        vat: { label: 'USt-Voranmeldung', desc: 'Periodische Umsatzsteuer fuer FinanzOnline', payableLabel: 'USt-Zahllast' },
      };
    case 'BE':
      return {
        ...fallbackLabels,
        pageTitle: 'Rapports Financiers - Belgique',
        pageSubtitle: 'Bilan, Compte de resultats, TVA',
        vat: { label: 'Declaration TVA', desc: 'TVA periodique - SPF Finances', payableLabel: 'TVA a payer' },
      };
    case 'FR':
      return {
        ...fallbackLabels,
        pageTitle: 'Rapports Financiers - France',
        pageSubtitle: 'Bilan, Compte de resultat, TVA',
        vat: { label: 'Declaration TVA', desc: 'TVA periodique - DGFiP', payableLabel: 'TVA due' },
      };
    case 'IT':
      return {
        ...fallbackLabels,
        pageTitle: 'Report Finanziari - Italia',
        pageSubtitle: 'Bilancio, Conto Economico, IVA',
        vat: { label: 'Liquidazione IVA', desc: 'Liquidazione periodica - Agenzia delle Entrate', payableLabel: 'IVA da versare' },
      };
    case 'NL':
      return {
        ...fallbackLabels,
        pageTitle: 'Financiele Rapporten - Nederland',
        pageSubtitle: 'Balans, Winst- en verliesrekening, BTW',
        vat: { label: 'BTW-aangifte', desc: 'Periodieke BTW - Belastingdienst', payableLabel: 'BTW te betalen' },
      };
    case 'HR':
      return {
        ...fallbackLabels,
        pageTitle: 'Financijski Izvjestaji - Hrvatska',
        pageSubtitle: 'Bilanca, Racun dobiti i gubitka, PDV',
        vat: { label: 'PDV obrazac', desc: 'Periodicni PDV - Porezna uprava', payableLabel: 'PDV za uplatu' },
      };
    case 'MK':
      return {
        ...fallbackLabels,
        pageTitle: 'Raporte Financiare - Maqedonia',
        pageSubtitle: 'Bilanci, Fitim-Humbja, TVSH',
        vat: { label: 'Deklarata e TVSH-se', desc: 'TVSH periodike - UJP', payableLabel: 'TVSH per pagese' },
      };
    case 'RS':
      return {
        ...fallbackLabels,
        pageTitle: 'Finansijski Izvestaji - Srbija',
        pageSubtitle: 'Bilans, Bilans uspeha, PDV',
        vat: { label: 'PDV prijava', desc: 'Periodicni PDV - Poreska uprava', payableLabel: 'PDV za uplatu' },
      };
    default:
      return fallbackLabels;
  }
}

export default function GermanFinancials() {
  const { profile } = useAuth();
  const { ctx, loading: complianceLoading } = useCompliance();
  const labels = useMemo(() => labelsForCountry(ctx.country_code), [ctx.country_code]);

  const vatStd = vatStandardRate(ctx) ?? 19;
  const vatRed = vatReducedRate(ctx) ?? 7;
  const curr = currencyRule(ctx);
  const coa = coaRule(ctx);
  const authority = taxAuthority(ctx);
  const isDE = isCountry(ctx, 'DE');

  const formatMoney = (n: number) => {
    try {
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: curr.code,
        minimumFractionDigits: 2,
      }).format(Number.isFinite(n) ? n : 0);
    } catch {
      return `${curr.symbol} ${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
    }
  };

  const baseTabs: { key: TabKey; label: string; icon: typeof Scale; desc: string }[] = [
    { key: 'bilanz', label: labels.bilanz.label, icon: Scale, desc: labels.bilanz.desc },
    { key: 'guv', label: labels.guv.label, icon: Calculator, desc: labels.guv.desc },
    { key: 'trial_balance', label: labels.trial.label, icon: ListOrdered, desc: labels.trial.desc },
    { key: 'vat', label: labels.vat.label, icon: Receipt, desc: labels.vat.desc },
    ...(labels.cashBasis
      ? [{ key: 'cash_basis' as TabKey, label: labels.cashBasis.label, icon: FileText, desc: labels.cashBasis.desc }]
      : []),
    { key: 'afa', label: labels.afa.label, icon: Briefcase, desc: labels.afa.desc },
  ];

  const [activeTab, setActiveTab] = useState<TabKey>('bilanz');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), 0, 1).toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [vat, setVat] = useState({
    salesStd: 0, vatStd: 0, salesRed: 0, vatRed: 0, salesIntraEU: 0,
    salesExport: 0, reverseChargeIn: 0, reverseChargeVat: 0,
    inputVatStd: 0, inputVatRed: 0, importVat: 0,
    payable: 0,
  });
  const [cash, setCash] = useState({ income: 0, expenses: 0, profit: 0 });
  const [afaRows, setAfaRows] = useState<Array<{ name: string; cost: number; years: number; annual: number; accumulated: number; book: number; acquired: string }>>([]);

  const loadData = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);

    try {
      const companyId = profile.company_id;

      if (activeTab === 'bilanz' || activeTab === 'trial_balance' || activeTab === 'guv') {
        const { data: coaRows } = await supabase
          .from('acc_chart_of_accounts')
          .select('account_code, name, account_type, account_group, vat_rate')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('account_code');

        const accountMap = new Map<string, CoARow>((coaRows ?? []).map((r: CoARow) => [r.account_code, r]));

        const [{ data: invoices }, { data: purchases }, { data: trans }, { data: banks }, { data: assets }] = await Promise.all([
          supabase.from('acc_invoices')
            .select('subtotal, vat_amount, total, status, invoice_date')
            .eq('company_id', companyId)
            .not('status', 'in', '("draft","cancelled")')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo),
          supabase.from('acc_purchases')
            .select('subtotal, vat_amount, total, status, purchase_date')
            .eq('company_id', companyId)
            .not('status', 'in', '("draft","awaiting_document","cancelled")')
            .gte('purchase_date', dateFrom)
            .lte('purchase_date', dateTo),
          supabase.from('acc_transactions')
            .select('transaction_type, amount, transaction_date')
            .eq('company_id', companyId)
            .gte('transaction_date', dateFrom)
            .lte('transaction_date', dateTo),
          supabase.from('acc_bank_accounts')
            .select('opening_balance')
            .eq('company_id', companyId),
          supabase.from('acc_fixed_assets')
            .select('acquisition_cost, accumulated_depreciation')
            .eq('company_id', companyId),
        ]);

        const totalInvoiceNet = (invoices ?? []).reduce((s, r) => s + Number(r.subtotal || 0), 0);
        const totalInvoiceVat = (invoices ?? []).reduce((s, r) => s + Number(r.vat_amount || 0), 0);
        const unpaidInvoices = (invoices ?? []).filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, r) => s + Number(r.total || 0), 0);
        const totalPurchaseNet = (purchases ?? []).reduce((s, r) => s + Number(r.subtotal || 0), 0);
        const totalPurchaseVat = (purchases ?? []).reduce((s, r) => s + Number(r.vat_amount || 0), 0);
        const unpaidPurchases = (purchases ?? []).filter(p => p.status !== 'paid' && p.status !== 'cancelled').reduce((s, r) => s + Number(r.total || 0), 0);
        const totalIncome = (trans ?? []).filter(t => t.transaction_type === 'income').reduce((s, r) => s + Number(r.amount || 0), 0);
        const totalExpense = (trans ?? []).filter(t => t.transaction_type === 'expense').reduce((s, r) => s + Number(r.amount || 0), 0);
        const totalBankOpening = (banks ?? []).reduce((s, r) => s + Number(r.opening_balance || 0), 0);
        const totalAssetsCost = (assets ?? []).reduce((s, r) => s + Number(r.acquisition_cost || 0), 0);
        const totalAssetsDepreciation = (assets ?? []).reduce((s, r) => s + Number(r.accumulated_depreciation || 0), 0);

        const bankBalance = totalBankOpening + totalIncome - totalExpense;
        const profit = totalInvoiceNet - totalPurchaseNet - totalExpense;

        const buildRow = (code: string, debit: number, credit: number): BalanceRow => {
          const a = accountMap.get(code);
          const balance = (a?.account_type === 'asset' || a?.account_type === 'expense') ? debit - credit : credit - debit;
          return {
            code,
            name: a?.name ?? code,
            group: a?.account_group ?? '',
            debit, credit, balance,
          };
        };

        const balanceRows: BalanceRow[] = [
          buildRow('0300', totalAssetsCost, 0),
          buildRow('0500', 0, totalAssetsDepreciation),
          buildRow('1200', bankBalance > 0 ? bankBalance : 0, 0),
          buildRow('1400', unpaidInvoices, 0),
          buildRow('1570', totalPurchaseVat, 0),
          buildRow('1700', 0, unpaidPurchases),
          buildRow('1770', 0, totalInvoiceVat),
          buildRow('2000', 0, totalBankOpening),
          buildRow('2100', 0, profit > 0 ? profit : 0),
          buildRow('2180', Math.abs(profit) > 0 && profit < 0 ? Math.abs(profit) : 0, 0),
          buildRow('8400', 0, totalInvoiceNet),
          buildRow('3400', totalPurchaseNet, 0),
          buildRow('4980', totalExpense, 0),
          buildRow('4830', totalAssetsDepreciation, 0),
        ];

        setRows(balanceRows);
      }

      if (activeTab === 'vat') {
        const [, , { data: imports }] = await Promise.all([
          supabase.from('acc_invoices')
            .select('subtotal, vat_amount, total, invoice_date')
            .eq('company_id', companyId)
            .not('status', 'in', '("draft","cancelled")')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo),
          supabase.from('acc_purchases')
            .select('subtotal, vat_amount, total')
            .eq('company_id', companyId)
            .not('status', 'in', '("draft","awaiting_document","cancelled")')
            .gte('purchase_date', dateFrom)
            .lte('purchase_date', dateTo),
          supabase.from('acc_imports')
            .select('customs_value, import_vat_total')
            .eq('company_id', companyId)
            .gte('import_date', dateFrom)
            .lte('import_date', dateTo),
        ]);

        const [{ data: invItems }, { data: purItems }] = await Promise.all([
          supabase.from('acc_invoice_items')
            .select('vat_rate, line_total, invoice_id, acc_invoices!inner(invoice_date, company_id, status)')
            .eq('acc_invoices.company_id', companyId)
            .not('acc_invoices.status', 'in', '("draft","cancelled")')
            .gte('acc_invoices.invoice_date', dateFrom)
            .lte('acc_invoices.invoice_date', dateTo),
          supabase.from('acc_purchase_items')
            .select('vat_rate, line_total, purchase_id, acc_purchases!inner(purchase_date, company_id, status)')
            .eq('acc_purchases.company_id', companyId)
            .not('acc_purchases.status', 'in', '("draft","awaiting_document","cancelled")')
            .gte('acc_purchases.purchase_date', dateFrom)
            .lte('acc_purchases.purchase_date', dateTo),
        ]);

        const sumByRate = (items: Array<{ vat_rate: number; line_total: number }> | null, rate: number) =>
          (items ?? []).filter(i => Number(i.vat_rate) === rate).reduce((s, i) => s + Number(i.line_total || 0), 0);

        const salesStd = sumByRate(invItems as any, vatStd);
        const salesRed = sumByRate(invItems as any, vatRed);
        const salesIntraEU = sumByRate(invItems as any, 0);
        const purStd = sumByRate(purItems as any, vatStd);
        const purRed = sumByRate(purItems as any, vatRed);
        const vatStdAmt = salesStd * (vatStd / 100);
        const vatRedAmt = salesRed * (vatRed / 100);
        const inputStd = purStd * (vatStd / 100);
        const inputRed = purRed * (vatRed / 100);
        const importVat = (imports ?? []).reduce((s, r) => s + Number(r.import_vat_total || 0), 0);
        const payable = (vatStdAmt + vatRedAmt) - (inputStd + inputRed + importVat);

        setVat({
          salesStd, vatStd: vatStdAmt, salesRed, vatRed: vatRedAmt, salesIntraEU,
          salesExport: 0, reverseChargeIn: 0, reverseChargeVat: 0,
          inputVatStd: inputStd, inputVatRed: inputRed, importVat,
          payable,
        });
      }

      if (activeTab === 'cash_basis') {
        const [{ data: invoices }, { data: purchases }, { data: trans }] = await Promise.all([
          supabase.from('acc_invoices')
            .select('subtotal, status')
            .eq('company_id', companyId)
            .eq('status', 'paid')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo),
          supabase.from('acc_purchases')
            .select('subtotal, status')
            .eq('company_id', companyId)
            .eq('status', 'paid')
            .gte('purchase_date', dateFrom)
            .lte('purchase_date', dateTo),
          supabase.from('acc_transactions')
            .select('transaction_type, amount')
            .eq('company_id', companyId)
            .gte('transaction_date', dateFrom)
            .lte('transaction_date', dateTo),
        ]);

        const income = (invoices ?? []).reduce((s, r) => s + Number(r.subtotal || 0), 0)
          + (trans ?? []).filter(t => t.transaction_type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
        const expenses = (purchases ?? []).reduce((s, r) => s + Number(r.subtotal || 0), 0)
          + (trans ?? []).filter(t => t.transaction_type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);

        setCash({ income, expenses, profit: income - expenses });
      }

      if (activeTab === 'afa') {
        const { data: assets } = await supabase
          .from('acc_fixed_assets')
          .select('name, acquisition_cost, useful_life_years, accumulated_depreciation, current_book_value, acquisition_date')
          .eq('company_id', companyId)
          .order('acquisition_date', { ascending: false });

        setAfaRows((assets ?? []).map((a: any) => ({
          name: a.name,
          cost: Number(a.acquisition_cost || 0),
          years: Number(a.useful_life_years || 1),
          annual: Number(a.acquisition_cost || 0) / Math.max(Number(a.useful_life_years || 1), 1),
          accumulated: Number(a.accumulated_depreciation || 0),
          book: Number(a.current_book_value || 0),
          acquired: a.acquisition_date,
        })));
      }
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id, activeTab, dateFrom, dateTo, vatStd, vatRed]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const validKeys = baseTabs.map(t => t.key);
    if (!validKeys.includes(activeTab)) setActiveTab('bilanz');
  }, [labels, activeTab]);

  const assetRows = rows.filter(r => parseInt(r.code) < 2000);
  const liabilityRows = rows.filter(r => {
    const code = parseInt(r.code);
    return code >= 1600 && code < 2000;
  });
  const equityRows = rows.filter(r => {
    const code = parseInt(r.code);
    return code >= 2000 && code < 3000;
  });
  const revenueRows = rows.filter(r => parseInt(r.code) >= 8000);
  const expenseRows = rows.filter(r => {
    const code = parseInt(r.code);
    return code >= 3000 && code < 8000;
  });

  const totalAssets = assetRows.filter(r => !liabilityRows.includes(r)).reduce((s, r) => s + Math.abs(r.balance), 0);
  const totalLiab = liabilityRows.reduce((s, r) => s + Math.abs(r.balance), 0);
  const totalEquity = equityRows.reduce((s, r) => s + Math.abs(r.balance), 0);
  const totalRevenue = revenueRows.reduce((s, r) => s + Math.abs(r.balance), 0);
  const totalExpense = expenseRows.reduce((s, r) => s + Math.abs(r.balance), 0);

  function exportCSV() {
    let csv = '';
    if (activeTab === 'bilanz') {
      csv = `${labels.bilanz.label}\n\n${labels.assetsHeading}\nKodi,Emri,Vlera\n`;
      assetRows.filter(r => !liabilityRows.includes(r)).forEach(r => { csv += `${r.code},${r.name},${r.balance.toFixed(2)}\n`; });
      csv += `\n${labels.totalAssets},,${totalAssets.toFixed(2)}\n\n${labels.liabilitiesHeading}\nKodi,Emri,Vlera\n`;
      [...liabilityRows, ...equityRows].forEach(r => { csv += `${r.code},${r.name},${r.balance.toFixed(2)}\n`; });
      csv += `\n${labels.totalLiabilities},,${(totalLiab + totalEquity).toFixed(2)}\n`;
    } else if (activeTab === 'trial_balance') {
      csv = 'Kodi,Emri,Debi,Kredi,Saldo\n';
      rows.forEach(r => { csv += `${r.code},${r.name},${r.debit.toFixed(2)},${r.credit.toFixed(2)},${r.balance.toFixed(2)}\n`; });
    } else if (activeTab === 'vat') {
      csv = `${labels.vat.label}\n\nShitjet\nNr,Pershkrim,Neto,TVSH\n`;
      csv += `1,Shitjet ${vatStd}%,${vat.salesStd.toFixed(2)},${vat.vatStd.toFixed(2)}\n`;
      csv += `2,Shitjet ${vatRed}%,${vat.salesRed.toFixed(2)},${vat.vatRed.toFixed(2)}\n`;
      csv += `3,Intra-EU shitjet,${vat.salesIntraEU.toFixed(2)},0\n`;
      csv += `\nTVSH e zbritshme\nNga fatura hyrese,${(vat.inputVatStd + vat.inputVatRed).toFixed(2)}\n`;
      csv += `TVSH importi,${vat.importVat.toFixed(2)}\n`;
      csv += `\n${labels.vat.payableLabel},${vat.payable.toFixed(2)}\n`;
    } else if (activeTab === 'cash_basis' && labels.cashBasis) {
      csv = `${labels.cashBasis.label}\n\nTe ardhurat,${cash.income.toFixed(2)}\nShpenzimet,${cash.expenses.toFixed(2)}\nFitimi,${cash.profit.toFixed(2)}\n`;
    } else if (activeTab === 'afa') {
      csv = 'Asetet\nEmri,Data,Vlera,Jetezgjatja,Amortizim vjetor,Akumuluar,Vlera kontabile\n';
      afaRows.forEach(a => { csv += `${a.name},${a.acquired},${a.cost.toFixed(2)},${a.years},${a.annual.toFixed(2)},${a.accumulated.toFixed(2)},${a.book.toFixed(2)}\n`; });
    } else if (activeTab === 'guv') {
      csv = `${labels.guv.label}\n\n${labels.income}\n`;
      revenueRows.forEach(r => { csv += `${r.code},${r.name},${r.balance.toFixed(2)}\n`; });
      csv += `${labels.totalIncome},,${totalRevenue.toFixed(2)}\n\n${labels.expenses}\n`;
      expenseRows.forEach(r => { csv += `${r.code},${r.name},${r.balance.toFixed(2)}\n`; });
      csv += `${labels.totalExpenses},,${totalExpense.toFixed(2)}\n${labels.result},,${(totalRevenue - totalExpense).toFixed(2)}\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (complianceLoading) {
    return <PageSkeleton rows={6} cols={4} />;
  }

  if (!ctx.country_code) {
    return (
      <div className="p-8 text-center">
        <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Shteti i kompanise nuk eshte konfiguruar</h2>
        <p className="text-sm text-gray-600">
          Ju lutem shkoni te <span className="font-medium">Cilesimet</span> dhe zgjidhni shtetin e kompanise per te aktivizuar raportet financiare.
        </p>
      </div>
    );
  }

  const activeTabMeta = baseTabs.find(t => t.key === activeTab) ?? baseTabs[0];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{labels.pageTitle}</h1>
          <p className="text-sm text-gray-600 mt-1">{labels.pageSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
            <Globe className="w-3.5 h-3.5" />
            {ctx.country_name ?? ctx.country_code} ({ctx.country_code})
          </span>
          {coa && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-medium">
              {coa.code}
            </span>
          )}
          {authority && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-medium">
              {authority.name}
            </span>
          )}
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200 font-medium">
            TVSH {vatStd}% / {vatRed}%
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200 font-medium">
            {curr.code}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
        <div className="p-4 flex flex-col lg:flex-row gap-4 lg:items-center">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm"
            />
            <span className="text-gray-400">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <div className="flex gap-2 lg:ml-auto">
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700"
            >
              <Download className="w-4 h-4" /> Eksporto CSV
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
            >
              <Printer className="w-4 h-4" /> Printo
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {baseTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-emerald-600 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <activeTabMeta.icon className="w-5 h-5 text-emerald-600" />
            {activeTabMeta.label}
          </h2>
          <p className="text-sm text-gray-500 mt-1">{activeTabMeta.desc}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          </div>
        ) : (
          <div className="p-4">
            {activeTab === 'bilanz' && (
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 text-base border-b-2 border-emerald-600 pb-2">{labels.assetsHeading}</h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {assetRows.filter(r => !liabilityRows.includes(r) && Math.abs(r.balance) > 0.01).map(r => (
                        <tr key={r.code} className="border-b border-gray-100">
                          <td className="py-1.5 text-gray-600 w-16 font-mono text-xs">{r.code}</td>
                          <td className="py-1.5">{r.name}</td>
                          <td className="py-1.5 text-right font-medium">{formatMoney(Math.abs(r.balance))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-between pt-3 border-t-2 border-gray-900 font-bold mt-3">
                    <span>{labels.totalAssets}</span>
                    <span>{formatMoney(totalAssets)}</span>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 text-base border-b-2 border-emerald-600 pb-2">{labels.liabilitiesHeading}</h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {[...equityRows, ...liabilityRows].filter(r => Math.abs(r.balance) > 0.01).map(r => (
                        <tr key={r.code} className="border-b border-gray-100">
                          <td className="py-1.5 text-gray-600 w-16 font-mono text-xs">{r.code}</td>
                          <td className="py-1.5">{r.name}</td>
                          <td className="py-1.5 text-right font-medium">{formatMoney(Math.abs(r.balance))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-between pt-3 border-t-2 border-gray-900 font-bold mt-3">
                    <span>{labels.totalLiabilities}</span>
                    <span>{formatMoney(totalLiab + totalEquity)}</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'guv' && (
              <div>
                <h3 className="font-semibold mb-3 border-b-2 border-emerald-600 pb-2">{labels.income}</h3>
                <table className="w-full text-sm mb-6">
                  <tbody>
                    {revenueRows.filter(r => Math.abs(r.balance) > 0.01).map(r => (
                      <tr key={r.code} className="border-b border-gray-100">
                        <td className="py-2 w-16 font-mono text-xs text-gray-500">{r.code}</td>
                        <td className="py-2">{r.name}</td>
                        <td className="py-2 text-right">{formatMoney(Math.abs(r.balance))}</td>
                      </tr>
                    ))}
                    <tr className="font-bold border-t-2 border-gray-900">
                      <td colSpan={2} className="py-2">{labels.totalIncome}</td>
                      <td className="py-2 text-right">{formatMoney(totalRevenue)}</td>
                    </tr>
                  </tbody>
                </table>
                <h3 className="font-semibold mb-3 border-b-2 border-red-600 pb-2">{labels.expenses}</h3>
                <table className="w-full text-sm mb-6">
                  <tbody>
                    {expenseRows.filter(r => Math.abs(r.balance) > 0.01).map(r => (
                      <tr key={r.code} className="border-b border-gray-100">
                        <td className="py-2 w-16 font-mono text-xs text-gray-500">{r.code}</td>
                        <td className="py-2">{r.name}</td>
                        <td className="py-2 text-right">{formatMoney(Math.abs(r.balance))}</td>
                      </tr>
                    ))}
                    <tr className="font-bold border-t-2 border-gray-900">
                      <td colSpan={2} className="py-2">{labels.totalExpenses}</td>
                      <td className="py-2 text-right">{formatMoney(totalExpense)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className={`flex justify-between items-center p-4 rounded-lg ${totalRevenue - totalExpense >= 0 ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>
                  <span className="font-semibold text-lg">{labels.result}</span>
                  <span className="font-bold text-xl">{formatMoney(totalRevenue - totalExpense)}</span>
                </div>
              </div>
            )}

            {activeTab === 'trial_balance' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-300 bg-gray-50">
                      <th className="text-left py-2 px-2 font-medium">Kodi</th>
                      <th className="text-left py-2 px-2 font-medium">Emri</th>
                      <th className="text-left py-2 px-2 font-medium">Grupi</th>
                      <th className="text-right py-2 px-2 font-medium">Debi</th>
                      <th className="text-right py-2 px-2 font-medium">Kredi</th>
                      <th className="text-right py-2 px-2 font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter(r => Math.abs(r.balance) > 0.01).map(r => (
                      <tr key={r.code} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-1.5 px-2 font-mono text-xs">{r.code}</td>
                        <td className="py-1.5 px-2">{r.name}</td>
                        <td className="py-1.5 px-2 text-xs text-gray-500">{r.group}</td>
                        <td className="py-1.5 px-2 text-right">{r.debit > 0 ? formatMoney(r.debit) : '-'}</td>
                        <td className="py-1.5 px-2 text-right">{r.credit > 0 ? formatMoney(r.credit) : '-'}</td>
                        <td className="py-1.5 px-2 text-right font-medium">{formatMoney(Math.abs(r.balance))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'vat' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-3 pb-2 border-b-2 border-emerald-600">Shitjet</h3>
                  <VatLine label={`Shitjet me TVSH ${vatStd}%`} net={vat.salesStd} vat={vat.vatStd} fmt={formatMoney} />
                  <VatLine label={`Shitjet me TVSH ${vatRed}%`} net={vat.salesRed} vat={vat.vatRed} fmt={formatMoney} />
                  <VatLine label={isDE ? 'Shitjet Intra-EU (tax-free §6a UStG)' : 'Shitjet me TVSH 0%'} net={vat.salesIntraEU} vat={0} fmt={formatMoney} />
                </div>
                <div>
                  <h3 className="font-semibold mb-3 pb-2 border-b-2 border-blue-600">TVSH e zbritshme</h3>
                  <VatLine label={`TVSH ${vatStd}% + ${vatRed}%`} net={0} vat={vat.inputVatStd + vat.inputVatRed} fmt={formatMoney} />
                  <VatLine label="TVSH importi" net={0} vat={vat.importVat} fmt={formatMoney} />
                </div>
                <div className={`p-4 rounded-lg flex justify-between ${vat.payable > 0 ? 'bg-red-50 text-red-900' : 'bg-emerald-50 text-emerald-900'}`}>
                  <span className="font-semibold">{labels.vat.payableLabel}</span>
                  <span className="font-bold text-lg">{formatMoney(vat.payable)}</span>
                </div>
                {authority && authority.exports.length > 0 && (
                  <p className="text-xs text-gray-500">
                    Formati i pranuar nga {authority.name}: {authority.exports.join(', ')}
                  </p>
                )}
              </div>
            )}

            {activeTab === 'cash_basis' && labels.cashBasis && (
              <div className="max-w-2xl space-y-3">
                <div className="flex justify-between py-3 border-b border-gray-200">
                  <span>Te ardhurat e realizuara</span>
                  <span className="font-semibold">{formatMoney(cash.income)}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-200">
                  <span>Shpenzimet e paguara</span>
                  <span className="font-semibold">{formatMoney(cash.expenses)}</span>
                </div>
                <div className={`flex justify-between p-4 rounded-lg ${cash.profit >= 0 ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>
                  <span className="font-semibold text-lg">Fitimi / Humbja</span>
                  <span className="font-bold text-xl">{formatMoney(cash.profit)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-4">{labels.cashBasis.note}</p>
              </div>
            )}

            {activeTab === 'afa' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-300 bg-gray-50">
                      <th className="text-left py-2 px-3">Emri</th>
                      <th className="text-left py-2 px-3">Data</th>
                      <th className="text-right py-2 px-3">Vlera fillestare</th>
                      <th className="text-right py-2 px-3">Jetezgjatja</th>
                      <th className="text-right py-2 px-3">Amortizim vjetor</th>
                      <th className="text-right py-2 px-3">Akumuluar</th>
                      <th className="text-right py-2 px-3">Vlera kontabile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {afaRows.map((a, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 px-3 font-medium">{a.name}</td>
                        <td className="py-2 px-3 text-gray-600">{a.acquired}</td>
                        <td className="py-2 px-3 text-right">{formatMoney(a.cost)}</td>
                        <td className="py-2 px-3 text-right">{a.years} vjet</td>
                        <td className="py-2 px-3 text-right">{formatMoney(a.annual)}</td>
                        <td className="py-2 px-3 text-right">{formatMoney(a.accumulated)}</td>
                        <td className="py-2 px-3 text-right font-semibold">{formatMoney(a.book)}</td>
                      </tr>
                    ))}
                    {afaRows.length === 0 && (
                      <tr><td colSpan={7} className="py-6 text-center text-gray-500">Nuk ka asete fikse te regjistruara.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function VatLine({ label, net, vat, fmt }: { label: string; net: number; vat: number; fmt: (n: number) => string }) {
  return (
    <div className="flex items-center py-2 border-b border-gray-100 text-sm">
      <span className="flex-1">{label}</span>
      {net > 0 && <span className="text-gray-600 text-xs w-32 text-right">neto: {fmt(net)}</span>}
      <span className="font-semibold w-32 text-right">{fmt(vat)}</span>
    </div>
  );
}

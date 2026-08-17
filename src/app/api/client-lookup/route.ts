import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { getISTToday } from '@/lib/dateTime';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mobileRaw = searchParams.get('mobile');

    if (!mobileRaw) {
      return Response.json({ error: 'Mobile required' }, { status: 400 });
    }

    const mobile = mobileRaw.replace(/\D/g, '');

    // FETCH ALL packages regardless of status to handle "Expired" or "Empty" in UI
    const { data: pkgs, error } = await supabase
      .from('packages')
      .select(`id, name, mobile, package_amount, total_hours, used_hours, remaining_hours, expiry_date, status, email`)
      .eq('mobile', mobile)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Lookup error:', error);
      return Response.json(null);
    }

    if (!pkgs || pkgs.length === 0) return Response.json(null);

    const today = getISTToday();

    // A package only counts toward the redeemable balance shown to staff if
    // it's actually redeemable: status='active' AND not past its expiry
    // date. Checking status alone isn't enough — status only flips to
    // 'expired' when someone happens to load the Packages/Audit admin page
    // (a lazy client-side effect), so a date-expired package can otherwise
    // sit at status='active' indefinitely. Without this check staff would
    // be shown hours here that redeem_package_hours() (which checks
    // expiry_date directly) would then correctly refuse to redeem.
    const isEligible = (p: any) =>
      p.status === 'active' && (!p.expiry_date || p.expiry_date >= today);

    let totalPackageHours = 0;
    let usedPackageHours = 0;
    let remainingHours = 0;

    const eligiblePkgs = pkgs.filter(isEligible);
    const primaryPkg = eligiblePkgs.length > 0 ? eligiblePkgs[0] : pkgs[0];
    let latestExpiry = primaryPkg.expiry_date;

    for (const p of pkgs) {
        if (isEligible(p)) {
            totalPackageHours += Number(p.total_hours);
            usedPackageHours += Number(p.used_hours);
            remainingHours += Number(p.remaining_hours);
        }
        if (p.expiry_date && (!latestExpiry || new Date(p.expiry_date) > new Date(latestExpiry))) {
            latestExpiry = p.expiry_date;
        }
    }

    // 'active' only when there's at least one package that's genuinely
    // redeemable right now (correct status, unexpired, hours left).
    const status = eligiblePkgs.length > 0 && remainingHours > 0 ? 'active' : 'expired';

    return Response.json({
      status,
      name: primaryPkg.name,
      mobile: primaryPkg.mobile,
      packageAmount: pkgs.reduce((sum, p) => sum + Number(p.package_amount), 0),
      totalPackageHours,
      usedPackageHours,
      remainingHours,
      expiryDate: latestExpiry,
      email: primaryPkg.email,
      packageId: primaryPkg.id, 
    });
  } catch (error) {
    console.error('Lookup error:', error);
    return Response.json(null);
  }
}

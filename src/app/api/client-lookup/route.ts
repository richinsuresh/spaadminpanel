import { supabase } from '@/lib/supabase';

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

    // Aggregate totals only for strictly active packages
    let totalPackageHours = 0;
    let usedPackageHours = 0;
    let remainingHours = 0;
    
    // Find the latest valid expiry date among all packages
    const activePkgs = pkgs.filter(p => p.status === 'active');
    const primaryPkg = activePkgs.length > 0 ? activePkgs[0] : pkgs[0];
    let latestExpiry = primaryPkg.expiry_date;

    for (const p of pkgs) {
        if (p.status === 'active') {
            totalPackageHours += Number(p.total_hours);
            usedPackageHours += Number(p.used_hours);
            remainingHours += Number(p.remaining_hours);
        }
        if (p.expiry_date && (!latestExpiry || new Date(p.expiry_date) > new Date(latestExpiry))) {
            latestExpiry = p.expiry_date;
        }
    }

    return Response.json({
      status: (remainingHours <= 0 && pkgs.some(p => p.status === 'active')) ? 'expired' : primaryPkg.status,
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

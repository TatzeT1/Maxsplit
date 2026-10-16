import { GroupDetailClient } from "@/components/groups/group-detail-client";
import { ReceiptScanProvider } from "@/components/groups/receipt-scan-context";
import { isReceiptScanConfigured } from "@/lib/receipt/scan";

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return (
    <ReceiptScanProvider enabled={isReceiptScanConfigured()}>
      <GroupDetailClient groupId={groupId} />
    </ReceiptScanProvider>
  );
}

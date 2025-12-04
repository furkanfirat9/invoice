import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isElif } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import BelgelerContent from "./BelgelerContent";

export default async function DocumentsPage() {
    const session = await getServerSession(authOptions);

    if (!isElif(session?.user?.email)) {
        redirect("/dashboard");
    }

    return (
        <div className="p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Belgeler</h1>
                <p className="text-gray-500 text-sm mt-1">Aylık sipariş listesi ve istatistikler</p>
            </div>
            <BelgelerContent />
        </div>
    );
}

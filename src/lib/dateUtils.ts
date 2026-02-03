export function calculateLengthOfService(joiningDateStr: string): string {
    if (!joiningDateStr) return "";

    // Support various date formats or just try to parse
    const joiningDate = new Date(joiningDateStr);
    if (isNaN(joiningDate.getTime())) return "";

    const now = new Date();
    let years = now.getFullYear() - joiningDate.getFullYear();
    let months = now.getMonth() - joiningDate.getMonth();

    if (months < 0) {
        years--;
        months += 12;
    }

    if (years < 0) return "未来の入社日";

    if (years === 0) {
        return `${months}ヶ月`;
    } else if (months === 0) {
        return `${years}年`;
    } else {
        return `${years}年${months}ヶ月`;
    }
}

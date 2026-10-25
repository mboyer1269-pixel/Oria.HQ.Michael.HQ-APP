export const useRouter = () => ({refresh: () => window.dispatchEvent(new Event('qualification-refresh'))});

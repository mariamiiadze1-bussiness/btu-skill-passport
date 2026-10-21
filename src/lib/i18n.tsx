import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "en" | "ka";

const ka: Record<string, string> = {
  "My Passport": "ჩემი პასპორტი", Verify: "ვერიფიკაცია", Admin: "ადმინისტრირება", "Sign in": "შესვლა", "Log out": "გასვლა",
  "Business and": "ბიზნესისა და", "Technology University": "ტექნოლოგიების უნივერსიტეტი", "Business and Technology University · Tbilisi": "ბიზნესისა და ტექნოლოგიების უნივერსიტეტი · თბილისი",
  "AI Skills": "AI უნარები", "Digital Passport": "ციფრული პასპორტი", Name: "სახელი", "Passport ID": "პასპორტის ID",
  "Current version": "მიმდინარე ვერსია", "Original issue": "პირველი გაცემის თარიღი", "View passport PDF": "პასპორტის ნახვა PDF-ში",
  "Download PDF": "PDF-ის ჩამოტვირთვა", "Previous versions": "წინა ვერსიები", "Hide versions": "ვერსიების დამალვა",
  "Latest · Active": "უახლესი · აქტიური", Superseded: "ჩანაცვლებულია", superseded: "ჩანაცვლებული", Open: "გახსნა", "Verified AI Skillset": "ვერიფიცირებული AI უნარები",
  "Collection of BTU-verified AI Skill Stamps": "BTU-ს მიერ დადასტურებული AI უნარების კოლექცია", "Earned through:": "მიღებულია:",
  "Verify a Passport": "პასპორტის ვერიფიკაცია", "Enter the verification code printed on the passport, or scan its QR code.": "შეიყვანეთ პასპორტზე მითითებული ვერიფიკაციის კოდი ან დაასკანერეთ QR კოდი.",
  "Verification code": "ვერიფიკაციის კოდი", "Scan QR": "QR-ის სკანირება", "Scanning…": "სკანირება…",
  "Keep your AI skills, verified achievements, and passport history together in one trusted place.": "შეინახეთ AI უნარები, დადასტურებული მიღწევები და პასპორტის ისტორია ერთ სანდო სივრცეში.",
  "Demo codes: X3BN-5VHC (current), P4TR-81ZD (superseded). QR scan is simulated in this demo.": "სადემო კოდები: X3BN-5VHC (მიმდინარე), P4TR-81ZD (ჩანაცვლებული). QR სკანირება დემო რეჟიმში სიმულირებულია.",
  "✓ Valid · current version": "✓ ვალიდურია · მიმდინარე ვერსია", "✓ Valid · superseded version": "✓ ვალიდურია · ჩანაცვლებული ვერსია",
  "Passport is authentic": "პასპორტი ავთენტურია", "Verified issuer": "ვერიფიცირებული გამცემი", "Document matches issued version": "დოკუმენტი ემთხვევა გაცემულ ვერსიას",
  "This is the current version": "ეს მიმდინარე ვერსიაა", "No newer version has been issued.": "უფრო ახალი ვერსია არ გაცემულა.",
  "A newer version ({version}) exists. Ask the holder for the latest passport.": "არსებობს უფრო ახალი ვერსია ({version}). სთხოვეთ მფლობელს უახლესი პასპორტი.",
  Holder: "მფლობელი", "Skills on record": "უნარების რაოდენობა", "To protect student privacy, only details needed to confirm authenticity are shown.": "სტუდენტის კონფიდენციალურობის დასაცავად ნაჩვენებია მხოლოდ ავთენტურობის დასადასტურებლად საჭირო ინფორმაცია.",
  "✕ Not verified": "✕ ვერიფიკაცია ვერ მოხერხდა", "No BTU passport matches code {code}. Check the code and try again.": "BTU-ს პასპორტი კოდით {code} ვერ მოიძებნა. გადაამოწმეთ კოდი და სცადეთ ხელახლა.",
  "Code {code} found in BTU registry": "კოდი {code} მოიძებნა BTU-ს რეესტრში", "Business and Technology University (BTU)": "ბიზნესისა და ტექნოლოგიების უნივერსიტეტი (BTU)",
  "v{version}, issued {date} · {hash}": "v{version}, გაცემულია {date} · {hash}", "{count} skills": "{count} უნარი",
  "Admin Dashboard": "ადმინისტრატორის პანელი", "AI Skills Digital Passport · processing overview": "AI უნარების ციფრული პასპორტი · პროცესების მიმოხილვა",
  completed: "დასრულებული", processing: "მუშავდება", pending: "მოლოდინში", failed: "შეცდომა", "Recent activity": "ბოლო აქტივობა",
  Retry: "ხელახლა ცდა", "Review confirmed skills": "დადასტურებული უნარების განხილვა", "Approve each skill, then generate the updated passport.": "დაადასტურეთ თითოეული უნარი და შექმენით განახლებული პასპორტი.",
  Approve: "დადასტურება", Reject: "უარყოფა", approved: "დადასტურებულია", rejected: "უარყოფილია", "✓ Passport queued for generation": "✓ პასპორტის შექმნა რიგშია",
  "Generate updated passport ({count} new)": "განახლებული პასპორტის შექმნა ({count} ახალი)", "Version history": "ვერსიების ისტორია", "Verification checks": "ვერიფიკაციის შემოწმებები",
  "Valid · current": "ვალიდურია · მიმდინარე", "Valid · superseded": "ვალიდურია · ჩანაცვლებული", "Not found": "ვერ მოიძებნა",
  "← Back to dashboard": "← პანელზე დაბრუნება", "Download / Save as PDF": "PDF-ის ჩამოტვირთვა / შენახვა", "This is version {version}, superseded by v{latest}.": "ეს არის {version} ვერსია, რომელიც ჩანაცვლებულია v{latest} ვერსიით.",
  "Date of issue:": "გაცემის თარიღი:", Surname: "გვარი", Version: "ვერსია", active: "აქტიური", "(active)": "(აქტიური)", "(superseded)": "(ჩანაცვლებული)",
  "AI Skills Detailed Information": "დეტალური ინფორმაცია AI უნარებზე", Stamp: "ნიშანი", Skill: "უნარი", "Earned through": "მიღების საფუძველი", Date: "თარიღი", "Verification code:": "ვერიფიკაციის კოდი:", "Verify at /verify": "ვერიფიკაცია: /verify",
  "AI Skill": "AI უნარი", "AI Applied Skill": "AI პრაქტიკული უნარი", "AI Advanced Skill": "AI გაფართოებული უნარი",
  "AI Skill stamp": "AI უნარის ნიშანი", "AI Applied Skill stamp": "AI პრაქტიკული უნარის ნიშანი", "AI Advanced Skill stamp": "AI გაფართოებული უნარის ნიშანი", "applied learning": "პრაქტიკული სწავლება", "Adv.": "გაფართ.",
  "Generative AI": "გენერაციული AI", Governance: "მართვა", Productivity: "პროდუქტიულობა", Data: "მონაცემები", Engineering: "ინჟინერია",
  "Prompt Engineering": "პრომპტების ინჟინერია", "AI Ethics & Responsible Use": "AI ეთიკა და პასუხისმგებლიანი გამოყენება", "AI Workflow Automation": "AI სამუშაო პროცესების ავტომატიზაცია", "Data Analysis with AI": "მონაცემთა ანალიზი AI-ით", "AI Agents": "AI აგენტები",
  "Guest Speaker Session": "მოწვეული სპიკერის სესია", Workshop: "ვორქშოფი", "Bootcamp (3 days)": "ბუთქემფი (3 დღე)", "Academic Course": "აკადემიური კურსი", Hackathon: "ჰაკათონი",
  "Applied prompting techniques for text, image and data generation tasks.": "პრომპტინგის ტექნიკის გამოყენება ტექსტის, სურათისა და მონაცემების გენერირებისთვის.",
  "Explored bias, data privacy and responsible AI use in real-world contexts.": "მიკერძოების, მონაცემთა კონფიდენციალურობისა და AI-ის პასუხისმგებლიანი გამოყენების შესწავლა რეალურ კონტექსტში.",
  "Combined multiple AI tools to automate a routine task and optimise workflow.": "რამდენიმე AI ხელსაწყოს გაერთიანება რუტინული ამოცანის ავტომატიზაციისა და სამუშაო პროცესის გასაუმჯობესებლად.",
  "In-depth knowledge and practical skills in data analysis using AI tools.": "AI ხელსაწყოებით მონაცემთა ანალიზის სიღრმისეული ცოდნა და პრაქტიკული უნარები.",
  "Built and tested a simple AI agent including prompt design and evaluation.": "მარტივი AI აგენტის შექმნა და ტესტირება, პრომპტის დიზაინისა და შეფასების ჩათვლით.",
  "Business Administration": "ბიზნესის ადმინისტრირება", "Passport v3 generated": "პასპორტის v3 ვერსია შეიქმნა", "Skill update: AI Agents": "უნარის განახლება: AI აგენტები", "Awaiting skill confirmation": "უნარის დადასტურების მოლოდინში", "PDF signing failed": "PDF-ის ხელმოწერა ვერ მოხერხდა", "Passport v2 generated": "პასპორტის v2 ვერსია შეიქმნა",
  "Workshop · 12 Oct 2026": "ვორქშოფი · 12 ოქტ. 2026", "Academic Course · Fall 2026": "აკადემიური კურსი · 2026 წლის შემოდგომა", "Hackathon · 18 Oct 2026": "ჰაკათონი · 18 ოქტ. 2026", "Attendance + assessment 86%": "დასწრება + შეფასება 86%", "Final grade A-": "საბოლოო შეფასება A-", "Project submission reviewed": "პროექტის წარდგენა შემოწმებულია",
  "Your skills.": "შენი უნარები.", "Verified.": "დადასტურებულია.", "BTU · Digital Passport": "BTU · ციფრული პასპორტი", "Student access": "სტუდენტის წვდომა", "Welcome back": "კეთილი იყოს დაბრუნება", "Create account heading": "ანგარიშის შექმნა",
  "Your full name": "თქვენი სრული სახელი", "you@example.com": "you@example.com", "At least 8 characters": "მინიმუმ 8 სიმბოლო", "Enter your password": "შეიყვანეთ პაროლი", "or continue with": "ან გააგრძელეთ", "Account access": "ანგარიშზე წვდომა",
  "Sign in to view your BTU AI Skills Passport.": "შედით BTU-ს AI უნარების პასპორტის სანახავად.", "Register to start building your verified skills passport.": "დარეგისტრირდით თქვენი ვერიფიცირებული უნარების პასპორტის შესაქმნელად.", Register: "რეგისტრაცია", "Full name": "სრული სახელი", "University or personal email": "უნივერსიტეტის ან პირადი ელფოსტა", Password: "პაროლი", "Use a password with at least 8 characters.": "პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს.", "Create account": "ანგარიშის შექმნა", "Continue with Google": "Google-ით გაგრძელება", "Continue as guest": "სტუმრის რეჟიმში გაგრძელება", "Verify a passport": "პასპორტის ვერიფიკაცია",
  "Account created for this demo. Opening your passport…": "სადემო ანგარიში შეიქმნა. პასპორტი იხსნება…", "Signed in for this demo. Opening your passport…": "სადემო რეჟიმში შეხვედით. პასპორტი იხსნება…", "Google sign-in needs OAuth credentials to be connected for this project.": "Google-ით შესასვლელად პროექტს OAuth მონაცემები უნდა დაუკავშირდეს.", "By continuing, you agree to use the passport service in line with BTU policies.": "გაგრძელებით ეთანხმებით პასპორტის სერვისის BTU-ს წესების შესაბამისად გამოყენებას.",
  "Your passport is blank": "თქვენი პასპორტი ცარიელია", "Loading passport": "პასპორტი იტვირთება", "Checking your account…": "ანგარიში მოწმდება…",
  "Register or sign in with the email from the BTU test data to see synced passport details. Guest mode and unregistered accounts stay blank.": "სინქრონიზებული პასპორტის სანახავად დარეგისტრირდით ან შედით BTU-ს სატესტო ფაილში მითითებული ელფოსტით. სტუმრისა და დაურეგისტრირებელი ანგარიშების პასპორტი ცარიელი დარჩება.",
  "Sign in or register": "შესვლა ან რეგისტრაცია", "No synced skills are currently on this passport.": "ამ პასპორტზე სინქრონიზებული უნარები ჯერ არ არის.", "Badge code:": "ბეიჯის კოდი:", "Badge codes:": "ბეიჯების კოდები:", Category: "კატეგორია", Program: "პროგრამა",
  "Prompt Engineering Fundamentals": "პრომპტების ინჟინერიის საფუძვლები", "Marketing Content with Generative AI": "მარკეტინგული კონტენტი გენერაციული AI-ით", "AI Productivity Tools": "AI პროდუქტიულობის ხელსაწყოები", "AI Business Decision Support": "AI ბიზნეს გადაწყვეტილებების მხარდაჭერა", "AI-Powered Customer Insights": "მომხმარებლის AI ანალიზი", "Machine Learning Model Development": "მანქანური სწავლების მოდელის შემუშავება", "AI Financial Analysis": "ფინანსური ანალიზი AI-ით", "AI Systems Deployment": "AI სისტემების დანერგვა", "AI Data Analysis": "მონაცემთა ანალიზი AI-ით", "Natural Language Processing": "ბუნებრივი ენის დამუშავება", "MLOps Fundamentals": "MLOps-ის საფუძვლები", "Predictive Analytics with AI": "პროგნოზული ანალიტიკა AI-ით",
  "Writing effective prompts for generative AI and evaluating responses.": "გენერაციული AI-სთვის ეფექტიანი პრომპტების დაწერა და პასუხების შეფასება.", "Generating, editing, and assessing marketing content with generative AI.": "მარკეტინგული კონტენტის გენერირება, რედაქტირება და შეფასება გენერაციული AI-ით.", "Using AI tools to improve efficiency in routine tasks.": "რუტინული ამოცანების ეფექტიანობის გასაუმჯობესებლად AI ხელსაწყოების გამოყენება.", "Using AI-driven analytics to support business decisions.": "ბიზნეს გადაწყვეტილებების მხარდასაჭერად AI ანალიტიკის გამოყენება.", "Analyzing customer data and deriving marketing insights with AI.": "მომხმარებლის მონაცემების ანალიზი და მარკეტინგული დასკვნების მიღება AI-ით.", "Automating workflows using AI tools and system integrations.": "სამუშაო პროცესების ავტომატიზაცია AI ხელსაწყოებითა და სისტემური ინტეგრაციებით.", "Identifying bias, privacy issues, and ethical risks in AI use.": "AI-ის გამოყენებაში მიკერძოების, კონფიდენციალურობისა და ეთიკური რისკების გამოვლენა.", "Building, training, and evaluating machine-learning models.": "მანქანური სწავლების მოდელების შექმნა, გაწვრთნა და შეფასება.", "Analyzing financial data and supporting evidence-based conclusions with AI.": "ფინანსური მონაცემების ანალიზი და მტკიცებულებებზე დაფუძნებული დასკვნების მხარდაჭერა AI-ით.", "Researching information with AI assistance and critically verifying sources.": "ინფორმაციის მოძიება AI-ის დახმარებით და წყაროების კრიტიკული გადამოწმება.", "Deploying and monitoring AI solutions in operational environments.": "AI გადაწყვეტილებების დანერგვა და მონიტორინგი სამუშაო გარემოში.", "Cleaning, analyzing, and interpreting data using AI tools.": "მონაცემების გასუფთავება, ანალიზი და ინტერპრეტაცია AI ხელსაწყოებით.", "Applying natural language processing methods to textual data.": "ბუნებრივი ენის დამუშავების მეთოდების გამოყენება ტექსტურ მონაცემებზე.", "Versioning, automating, and maintaining machine-learning workflows.": "მანქანური სწავლების პროცესების ვერსიების მართვა, ავტომატიზაცია და შენარჩუნება.", "Developing predictive models and evaluating their performance.": "პროგნოზული მოდელების შემუშავება და მათი ეფექტიანობის შეფასება.",
  "A university-wide initiative of Business and Technology University (BTU)": "ბიზნესისა და ტექნოლოგიების უნივერსიტეტის (BTU) უნივერსიტეტული ინიციატივა", "Business and Technology University": "ბიზნესისა და ტექნოლოგიების უნივერსიტეტი",
  "Passport cover": "პასპორტის ყდა", "About the passport": "პასპორტის შესახებ", "AI skill supplement": "AI უნარების დანართი", "Latest AI skillset": "უახლესი AI უნარები", "Archived AI skillset": "არქივირებული AI უნარები", "BTU verified": "BTU-ს მიერ დადასტურებული", "AI Skills Digital Passport": "AI უნარების ციფრული პასპორტი",
  "About the AI Skills Digital Passport": "AI უნარების ციფრული პასპორტის შესახებ", "The BTU AI Skills Digital Passport is your personalized and verifiable record of AI competencies developed throughout your university experience.": "BTU-ს AI უნარების ციფრული პასპორტი უნივერსიტეტში სწავლის პერიოდში განვითარებული AI კომპეტენციების პერსონალიზებული და გადამოწმებადი ჩანაწერია.",
  "AI Skill Stamps may be earned through eligible academic courses, workshops, masterclasses, hackathons, intensive programs, guest speaker sessions, and other AI-related learning experiences recognized by BTU.": "AI უნარების ნიშნების მიღება შესაძლებელია შესაბამისი სასწავლო კურსებით, ვორქშოფებით, მასტერკლასებით, ჰაკათონებით, ინტენსიური პროგრამებით, მოწვეული სპიკერების სესიებითა და BTU-ს მიერ აღიარებული AI-სთან დაკავშირებული სხვა სასწავლო გამოცდილებით.", "Participation is voluntary. Students choose learning opportunities according to their interests, studies, and professional objectives.": "მონაწილეობა ნებაყოფლობითია. სტუდენტები სასწავლო შესაძლებლობებს საკუთარი ინტერესების, სწავლისა და პროფესიული მიზნების მიხედვით ირჩევენ.", "Understanding AI Skills Stamps": "AI უნარების ნიშნების განმარტება",
  "AI Skill · focused learning": "AI უნარი · მიზნობრივი სწავლება", "Awarded through an eligible focused learning experience, such as a workshop, masterclass, seminar, guest speaker session, or similar short-format activity.": "გაიცემა შესაბამისი მიზნობრივი სასწავლო გამოცდილებისთვის, როგორიცაა ვორქშოფი, მასტერკლასი, სემინარი, მოწვეული სპიკერის სესია ან მსგავსი მოკლევადიანი აქტივობა.", "Development of a defined AI competency.": "განსაზღვრული AI კომპეტენციის განვითარება.",
  "AI Applied Skill · applied learning": "AI პრაქტიკული უნარი · პრაქტიკული სწავლება", "Awarded through an eligible extended practical learning experience, typically lasting two to three days, such as an intensive workshop, bootcamp, hackathon, or challenge.": "გაიცემა შესაბამისი ხანგრძლივი პრაქტიკული სასწავლო გამოცდილებისთვის, ჩვეულებრივ ორი-სამი დღის ინტენსიური ვორქშოფის, ბუთქემფის, ჰაკათონის ან გამოწვევის ფარგლებში.", "Hands-on application of a defined AI competency.": "განსაზღვრული AI კომპეტენციის პრაქტიკული გამოყენება.",
  "AI Advanced Skill · extended academic learning": "AI გაფართოებული უნარი · ხანგრძლივი აკადემიური სწავლება", "Awarded through successful completion of an eligible semester-long academic course with assessed AI competency outcomes.": "გაიცემა შესაბამისი სემესტრული აკადემიური კურსის წარმატებით დასრულებისთვის, რომლის შეფასებულ შედეგებშიც შედის AI კომპეტენციები.", "Extended and formally assessed development of an AI competency.": "AI კომპეტენციის ხანგრძლივი და ფორმალურად შეფასებული განვითარება.",
  Important: "მნიშვნელოვანია", "Stamp types represent different learning formats. They are not a mandatory sequence; students may earn any type in any order.": "ნიშნების ტიპები სწავლის სხვადასხვა ფორმატს აღნიშნავს. ისინი სავალდებულო თანმიმდევრობა არ არის; სტუდენტს ნებისმიერი ტიპის ნიშნის მიღება ნებისმიერი რიგით შეუძლია.", Represents: "ასახავს:", Learn: "ისწავლე", Demonstrate: "აჩვენე", Earn: "მოიპოვე", "Build your AI profile": "შექმენი AI პროფილი",
  "AI Skill Supplement": "AI უნარების დანართი", "Detailed record of verified AI skills and learning experiences": "ვერიფიცირებული AI უნარებისა და სასწავლო გამოცდილების დეტალური ჩანაწერი", "Stamp type": "ნიშნის ტიპი", Description: "აღწერა", "Date earned": "მიღების თარიღი", "Badge code": "ბეიჯის კოდი", "Each issued passport version has its own verification code, printed on the passport cover.": "პასპორტის თითოეულ გაცემულ ვერსიას საკუთარი ვერიფიკაციის კოდი აქვს, რომელიც პასპორტის ყდაზეა მითითებული.", "Preparing PDF…": "PDF მზადდება…", "Could not create the passport PDF. Please try again.": "პასპორტის PDF ვერ შეიქმნა. სცადეთ ხელახლა.", "Passport PDF preview": "პასპორტის PDF-ის გადახედვა", "Your original four-page template is preserved.": "თქვენი ორიგინალი ოთხგვერდიანი შაბლონი შენარჩუნებულია.", "Download the filled passport to view the completed document.": "სრულად შევსებული დოკუმენტის სანახავად ჩამოტვირთეთ პასპორტი.", "Open filled PDF in new tab": "შევსებული PDF-ის ახალ ჩანართში გახსნა",
};

type I18nValue = { language: Language; setLanguage: (language: Language) => void; t: (text: string, vars?: Record<string, string | number>) => string };
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  useEffect(() => {
    const saved = localStorage.getItem("btu-passport-language");
    if (saved === "ka" || saved === "en") {
      setLanguageState(saved);
      document.documentElement.lang = saved;
    }
  }, []);
  const setLanguage = (next: Language) => {
    setLanguageState(next);
    localStorage.setItem("btu-passport-language", next);
    document.documentElement.lang = next;
  };
  const value = useMemo<I18nValue>(() => ({
    language,
    setLanguage,
    t: (text, vars = {}) => {
      let output = language === "ka" ? ka[text] ?? text : text;
      for (const [key, val] of Object.entries(vars)) output = output.replaceAll(`{${key}}`, String(val));
      return output;
    },
  }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}

export function LanguageToggle() {
  const { language, setLanguage } = useI18n();
  return (
    <div className="flex items-center rounded-full border p-0.5 text-[11px] font-bold" aria-label="Language">
      {(["en", "ka"] as const).map((code) => (
        <button key={code} type="button" lang={code} aria-pressed={language === code} onClick={() => setLanguage(code)}
          className={`rounded-full px-2.5 py-1 transition-colors ${language === code ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
          {code === "en" ? "EN" : "ქარ"}
        </button>
      ))}
    </div>
  );
}

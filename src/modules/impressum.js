const emailPartsByTargetId = {
	publisherEmail: {
		local: [109, 100],
		domain: [109, 105, 99, 104, 97, 101, 108, 45, 100, 105, 101, 110, 101, 114],
		tld: [99, 111, 109]
	},
	contactEmail: {
		local: [109, 100],
		domain: [109, 105, 99, 104, 97, 101, 108, 45, 100, 105, 101, 110, 101, 114],
		tld: [99, 111, 109]
	}
};

function decodeText(charCodes) {
	return String.fromCharCode(...charCodes);
}

function formatEmailSnippet(emailParts) {
	const local = decodeText(emailParts.local);
	const domain = decodeText(emailParts.domain);
	const tld = decodeText(emailParts.tld);
	return `const contact = \"${local} [at] ${domain} [dot] ${tld}\";`;
}

document.querySelectorAll("[data-email-target]").forEach((button) => {
	button.addEventListener("click", () => {
		const targetId = button.getAttribute("data-email-target");
		const target = document.getElementById(targetId);
		const emailParts = emailPartsByTargetId[targetId];

		if (!target || !emailParts) {
			return;
		}

		target.textContent = formatEmailSnippet(emailParts);
		target.setAttribute("aria-label", "Obfuscated contact address shown as code snippet.");
		target.hidden = false;
		button.hidden = true;
	});
});
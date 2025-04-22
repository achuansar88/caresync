const validationErros = {
    required: "Name. Age or gender is missing",
    nameError: "Not a valid name, special characters or numbers except '.' and single space is not allowed",
    ageError: "Age should be in between 0.1 to 150",
    genderError: "Gender should be either male, female or other",
    phoneError: "Not a valid phone number",
    emailError: "Not a valid email",
    heightError: "Height should be a number",
    weightError: "Weight should be a number"
}

module.exports = {
    validationErros
};
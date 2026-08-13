def add_numbers(numbers):
    total = 0
    for n in numbers:
        total += n
    return total

def main():
    nums = [1, 2, 3, 4, 5]
    print("Numbers:", nums)
    result = add_numbers(nums)
    print("Final Result:", result)

main()